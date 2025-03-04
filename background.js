// Initialize the extension when installed
chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.sync.get(
    {
      apiKey: '',
      topics: '',
      quizFrequency: 30,
      mcq: true,
      fillBlanks: true,
      difficulty: 'intermediate',
      quizzesToday: 0,
      lastQuizTime: 0,
      previousQuestions: [] // Add storage for previous questions
    },
    (items) => {
      // Setup alarm for quiz generation
      if (items.apiKey && items.topics) {
        setupQuizAlarm(items.quizFrequency);
      }
      
      // Reset daily quiz count at midnight
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const msUntilMidnight = midnight.getTime() - Date.now();
      
      chrome.alarms.create('resetDailyQuizCount', {
        delayInMinutes: msUntilMidnight / (60 * 1000),
        periodInMinutes: 24 * 60 // Run every 24 hours
      });
    }
  );
  
  // Open options page after installation
  chrome.runtime.openOptionsPage();
});

// Listen for alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'quizGenerator') {
    generateQuiz();
  } else if (alarm.name === 'resetDailyQuizCount') {
    // Reset daily quiz count
    chrome.storage.sync.set({ quizzesToday: 0 });
  } else if (alarm.name === 'quizWatchdog') {
    // Check if it's time to show a quiz based on the last quiz time
    chrome.storage.sync.get(['lastQuizTime', 'quizFrequency'], (items) => {
      const now = Date.now();
      const lastQuizTime = items.lastQuizTime || 0;
      const quizFrequency = items.quizFrequency || 30;
      
      // Convert frequency to milliseconds
      const frequencyMs = quizFrequency * 60 * 1000;
      
      // If it's been longer than the frequency since the last quiz, generate a new one
      if (now - lastQuizTime > frequencyMs + (2 * 60 * 1000)) { // Add 2 minutes buffer
        console.log('Watchdog detected missed quiz, generating now');
        generateQuiz();
      }
    });
  }
});

// Listen for message events
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateQuizSchedule') {
    chrome.storage.sync.get(['quizFrequency', 'apiKey', 'topics'], (items) => {
      if (items.apiKey && items.topics) {
        setupQuizAlarm(items.quizFrequency);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, message: 'API key or topics not set' });
      }
    });
    return true; // Indicate we'll respond asynchronously
  }
  
  if (message.action === 'generateQuizNow') {
    generateQuiz()
      .then(result => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, message: error.message }));
    return true; // Indicate we'll respond asynchronously
  }
});

// Setup alarm for quiz generation
function setupQuizAlarm(frequencyInMinutes) {
  // Clear existing alarm if any
  chrome.alarms.clear('quizGenerator');
  
  // Create new alarm with precise timing
  chrome.alarms.create('quizGenerator', {
    delayInMinutes: frequencyInMinutes,
    periodInMinutes: frequencyInMinutes
  });
  
  // Add a watchdog timer to ensure quiz generation happens on schedule
  chrome.alarms.create('quizWatchdog', {
    delayInMinutes: 5,
    periodInMinutes: 5
  });
}

// Generate quiz
async function generateQuiz() {
  const settings = await chrome.storage.sync.get({
    apiKey: '',
    topics: '',
    difficulty: 'intermediate',
    mcq: true,
    fillBlanks: true,
    quizzesToday: 0
  });
  
  if (!settings.apiKey) {
    throw new Error('OpenAI API key not configured');
  }
  
  if (!settings.topics) {
    throw new Error('Learning topics not configured');
  }
  
  // Get all tabs to send the quiz to all of them
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  if (tabs.length === 0) {
    throw new Error('No compatible tabs found');
  }
  
  // Choose a topic from the list
  const topicsList = settings.topics.split(',').map(t => t.trim());
  const selectedTopic = topicsList[Math.floor(Math.random() * topicsList.length)];
  
  // Determine quiz type
  let quizType = 'mcq';
  if (settings.mcq && settings.fillBlanks) {
    quizType = Math.random() > 0.5 ? 'mcq' : 'fillBlanks';
  } else if (settings.fillBlanks) {
    quizType = 'fillBlanks';
  }
  
  // Find the currently active tab for context
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageTitle = activeTab ? activeTab.title : '';
  const pageUrl = activeTab ? activeTab.url : '';
  
  // Generate quiz using OpenAI API
  try {
    const quiz = await generateQuizFromOpenAI(
      settings.apiKey,
      selectedTopic,
      quizType,
      settings.difficulty,
      pageTitle,
      pageUrl
    );
    
    // Apply additional code formatting hints if needed
    if (selectedTopic.toLowerCase().includes('programming') || 
        selectedTopic.toLowerCase().includes('code') ||
        selectedTopic.toLowerCase().includes('javascript') ||
        selectedTopic.toLowerCase().includes('python') ||
        selectedTopic.toLowerCase().includes('java') ||
        selectedTopic.toLowerCase().includes('c++') ||
        selectedTopic.toLowerCase().includes('typescript')) {
      // Add code formatting hints in the explanation
      if (quiz.explanation && !quiz.explanation.includes('```')) {
        quiz.explanation = quiz.explanation.replace(/`([^`]+)`/g, '```\n$1\n```');
      }
    }
    
    // Post-process the quiz for markdown
    if (quizType === 'fillBlanks') {
      // Ensure blanks are properly formatted for display
      processFillBlanksMarkdown(quiz);
    }
    
    // Send quiz to all tabs
    for (const tab of tabs) {
      try {
        // Check if content script is loaded by sending a ping message first
        chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script not loaded, silently ignore
            console.log(`Tab ${tab.id} not ready for quiz`);
            return;
          }
          
          // If we get a response, content script is loaded, send the quiz
          chrome.tabs.sendMessage(tab.id, {
            action: 'displayQuiz',
            quiz
          });
        });
      } catch (error) {
        console.error(`Failed to send quiz to tab ${tab.id}:`, error);
      }
    }
    
    // Store the current question in previousQuestions array
    // Get current previousQuestions
    const currentSettings = await chrome.storage.sync.get({
      previousQuestions: []
    });
    
    // Add the new question to the array 
    let updatedQuestions = [...currentSettings.previousQuestions];
    
    // Add the new question to the beginning of the array
    updatedQuestions.unshift({
      question: quiz.question,
      type: quizType,
      topic: selectedTopic
    });
    
    // Keep only the last 10 questions
    if (updatedQuestions.length > 10) {
      updatedQuestions = updatedQuestions.slice(0, 10);
    }
    
    // Update last quiz time, count, and previous questions
    chrome.storage.sync.set({
      lastQuizTime: Date.now(),
      quizzesToday: settings.quizzesToday + 1,
      previousQuestions: updatedQuestions
    });
    
    return true;
  } catch (error) {
    console.error('Failed to generate quiz:', error);
    throw error;
  }
}

// Process fill-in-the-blanks quiz for markdown content
function processFillBlanksMarkdown(quiz) {
  // Check if the question has markdown-style blanks (underscores)
  const markdownBlankRegex = /\b_{2,}\b/g;
  
  // Count the blanks in the question
  let matches = quiz.question.match(markdownBlankRegex) || [];
  const blankCount = matches.length;
  
  // If we have blanks in the markdown but not in the quiz data, create them
  if (blankCount > 0 && (!quiz.blanks || quiz.blanks.length === 0)) {
    quiz.blanks = Array.from({ length: blankCount }, (_, i) => i);
    
    // Replace markdown blanks with our placeholder format
    let blankIndex = 0;
    quiz.question = quiz.question.replace(markdownBlankRegex, () => {
      const placeholder = `[BLANK_${blankIndex}]`;
      blankIndex++;
      return placeholder;
    });
  }
}

// Generate quiz using OpenAI API
async function generateQuizFromOpenAI(apiKey, topic, quizType, difficulty, pageTitle, pageUrl) {
  const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
  
  // Get previous questions from storage
  const settings = await chrome.storage.sync.get({
    previousQuestions: []
  });
  
  let previousQuestionsText = '';
  if (settings.previousQuestions && settings.previousQuestions.length > 0) {
    previousQuestionsText = `\n\nHere are the last ${settings.previousQuestions.length} questions that have been asked. Please create a NEW question that is not repetitive with these:\n\n${settings.previousQuestions.map((q, i) => `${i+1}. ${q.question || q}`).join('\n')}`;
  }
  
  let promptContent = '';
  if (quizType === 'mcq') {
    promptContent = `Create a multiple-choice quiz question about "${topic}" at ${difficulty} level. Include 4 options (A, B, C, D) with only one correct answer. Also provide a detailed explanation for the correct answer. 
    
    If the question involves code or programming, format code examples using triple backticks for blocks or single backticks for inline code. For example: \`\`\`javascript\nconsole.log('Hello world');\n\`\`\` or inline like \`const x = 10\`.
    You can also involve code in the ques as well if necessary
    Format the response as JSON with these fields: question, options (array), correctAnswer (letter), explanation.Provide In depth Answer with easy examples if the numerical dry run is required then provide it. Also add a section in the answer as if you are explaining it to a 5 year old.if the answer contains code then Provide the step By step Dry Run  of the code . my the dry run as illustrative as Possible and DO NOT Answer in Markdown use plain text in the answer.${previousQuestionsText}`;
  } else {
    promptContent = `Create a fill-in-the-blanks quiz about "${topic}" at ${difficulty} level. Include a sentence or code snippet with 1-3 blanks, and provide options for each blank that can be dragged to fill them. Include a detailed explanation.
    
    IMPORTANT: For blanks, use double underscores like "__" directly in the text. DO NOT use placeholders like [BLANK_0] in your response. The blanks should be clearly visible in the text as underscores.
    You can also involve code in the ques as well if necessary
    Example format with underscores for blanks:
    "In Python, the __ keyword is used to declare variables that cannot be reassigned."
    
    If the question involves code or programming, format code examples using triple backticks for blocks or single backticks for inline code. For example: \`\`\`javascript\nconsole.log('Hello world');\n\`\`\` or inline like \`const x = 10\`.
    
    Format the response as JSON with these fields: 
    - question (with underscores for blanks)
    - blanks (array of positions - you can leave this empty as we'll detect blanks using underscores)
    - options (array of possible answers)
    - correctAnswers (array matching the blanks in order)
    - explanation
    
    Provide an in-depth answer with easy examples. If numerical dry run is required, include it. Also add a section explaining it as if to a 5-year-old. If the answer contains code, provide a step-by-step dry run of the code. Make the dry run as illustrative as possible and use plain text in the answer, not markdown.${previousQuestionsText}`;
  }
  
  const data = {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You’re a quiz-making wizard here to whip up short, spot-on, and downright fun quizzes that actually teach people stuff—because, let’s be real, learning doesn’t have to be a snoozefest! Talk like that cool, slightly snarky friend who’s always got a joke up their sleeve (Why don’t skeletons learn? They’ve got no brains to fill!). Make it super approachable—think “explaining to your goofy cousin” vibes. Twist the quiz around whatever topic, difficulty, and random webpage junk (like titles or URLs) I throw at you, and if there’s a dumb myth people believe, smack it down with facts. Keep every question, option, and explanation so clear and right that even a goldfish could get it, and if there’s code involved, make it perfect and pretty—like, triple backticks for the big stuff (\\`\\`\\`javascript\\nconsole.log(\\"Yo!\\");\\n\\`\\`\\`) and single ones for quickies (\\`let x = \\"cool\\";\\`). No sloppy nonsense, okay? Let’s make learning a party, not a punishment!'
      },
      {
        role: 'user',
        content: promptContent
      }
    ],
    temperature: 0.7,
    max_tokens: 4096,
    response_format: { type: 'json_object' }
  };
  
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
  }
  
  const result = await response.json();
  const quizContent = JSON.parse(result.choices[0].message.content);
  
  // Add metadata
  return {
    ...quizContent,
    topic,
    type: quizType,
    difficulty,
    context: pageTitle,
    timestamp: new Date().toISOString()
  };
}