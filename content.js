// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Respond to ping messages to verify content script is loaded
  if (message.action === 'ping') {
    sendResponse({ status: 'ready' });
    return true;
  }
  
  if (message.action === 'displayQuiz' && message.quiz) {
    // Only display the quiz if we don't already have one open
    if (!document.getElementById('quizme-gpt-container')) {
      displayQuiz(message.quiz);
      sendResponse({ success: true });
    } else {
      // If a quiz is already displayed, ignore this one to prevent overwriting
      console.log('Quiz already displayed, ignoring new quiz');
      sendResponse({ success: false, reason: 'Quiz already displayed' });
    }
  }
  return true;
});

// Create and display quiz popup
function displayQuiz(quizData) {
  // Remove existing quiz if present
  removeExistingQuiz();
  
  // Create overlay to prevent interaction with the page
  const overlay = document.createElement('div');
  overlay.id = 'quizme-gpt-overlay';
  overlay.classList.add('quizme-gpt-overlay');
  
  // Create quiz container
  const quizContainer = document.createElement('div');
  quizContainer.id = 'quizme-gpt-container';
  quizContainer.classList.add('quizme-gpt-container');
  
  // Process the quiz data to format code snippets
  if (quizData.question) {
    quizData.question = formatCodeSnippets(quizData.question);
  }
  
  if (quizData.explanation) {
    quizData.explanation = formatCodeSnippets(quizData.explanation);
  }
  
  // Create quiz content based on type
  let quizContent = '';
  if (quizData.type === 'mcq') {
    quizContent = createMCQQuiz(quizData);
  } else if (quizData.type === 'fillBlanks') {
    quizContent = createFillBlanksQuiz(quizData);
  }
  
  // Set the HTML content
  quizContainer.innerHTML = `
    <div class="quizme-gpt-header">
      <h2>QuizMeGPT: ${quizData.topic}</h2>
      <div class="quizme-gpt-controls">
        <button id="quizme-gpt-minimize" class="quizme-gpt-btn">−</button>
        <button id="quizme-gpt-close" class="quizme-gpt-btn" disabled>×</button>
      </div>
    </div>
    <div class="quizme-gpt-content">
      <div class="quizme-gpt-difficulty">${capitalizeFirstLetter(quizData.difficulty)} Level</div>
      ${quizContent}
    </div>
  `;
  
  // Add the overlay and quiz to the page
  document.body.appendChild(overlay);
  document.body.appendChild(quizContainer);
  
  // Add event listeners
  setupQuizEventListeners(quizContainer, quizData);
  
  // Make the quiz draggable
  makeQuizDraggable(quizContainer);
}

// Create MCQ quiz content
function createMCQQuiz(quizData) {
  const options = quizData.options.map((option, index) => {
    const optionLetter = String.fromCharCode(65 + index); // A, B, C, D...
    return `
      <div class="quizme-gpt-option">
        <input type="radio" name="quizme-option" id="quizme-option-${optionLetter}" value="${optionLetter}">
        <label for="quizme-option-${optionLetter}">${optionLetter}: ${option}</label>
      </div>
    `;
  }).join('');
  
  return `
    <div class="quizme-gpt-question">${quizData.question}</div>
    <div class="quizme-gpt-options">
      ${options}
    </div>
    <div class="quizme-gpt-actions">
      <button id="quizme-gpt-submit" class="quizme-gpt-btn quizme-gpt-primary-btn">Check Answer</button>
    </div>
    <div id="quizme-gpt-feedback" class="quizme-gpt-feedback"></div>
  `;
}

// Create fill-in-the-blanks quiz content
function createFillBlanksQuiz(quizData) {
  // Process the question to add blanks
  let questionWithBlanks = quizData.question;
  
  // Check if question contains markdown-style underscores for blanks and convert them
  const markdownBlankRegex = /\b_{2,}\b/g;
  let blankIndex = 0;
  
  // First, count the number of blanks
  const matches = questionWithBlanks.match(markdownBlankRegex);
  if (matches) {
    // Convert markdown blanks to our placeholder format
    questionWithBlanks = questionWithBlanks.replace(markdownBlankRegex, () => {
      const placeholder = `[BLANK_${blankIndex}]`;
      blankIndex++;
      return placeholder;
    });
    
    // Update blanks array if needed
    if (!quizData.blanks || quizData.blanks.length !== blankIndex) {
      quizData.blanks = Array.from({ length: blankIndex }, (_, i) => i);
    }
  }
  
  // Replace blank placeholders with "________" (8 underscores)
  let questionWithUnderscores = questionWithBlanks;
  for (let i = 0; i < (quizData.blanks?.length || 0); i++) {
    const blankPlaceholder = `[BLANK_${i}]`;
    // Use regex with global flag to replace all occurrences
    const blankRegex = new RegExp(escapeRegExp(blankPlaceholder), 'g');
    if (questionWithUnderscores.includes(blankPlaceholder)) {
      questionWithUnderscores = questionWithUnderscores.replace(
        blankRegex, 
        `________`
      );
    }
  }
  
  // Create input fields for each blank
  let inputFields = '';
  for (let i = 0; i < (quizData.blanks?.length || 0); i++) {
    inputFields += `
      <div class="quizme-gpt-input-container">
        <label>Input (for blank ${i+1}):</label>
        <input type="text" class="quizme-gpt-input-blank" data-blank-index="${i}" placeholder="Type answer here...">
      </div>
    `;
  }
  
  // Create options as a reference list
  const options = quizData.options.map((option) => {
    return `<li class="quizme-gpt-option-item">${option}</li>`;
  }).join('');
  
  return `
    <div class="quizme-gpt-question-blanks">${questionWithUnderscores}</div>
    <div class="quizme-gpt-input-fields">
      ${inputFields}
    </div>
    <div class="quizme-gpt-options-list">
      <p>Choose from these options:</p>
      <ul>
        ${options}
      </ul>
    </div>
    <div class="quizme-gpt-actions">
      <button id="quizme-gpt-reset" class="quizme-gpt-btn">Reset</button>
      <button id="quizme-gpt-submit" class="quizme-gpt-btn quizme-gpt-primary-btn">Check Answer</button>
    </div>
    <div id="quizme-gpt-feedback" class="quizme-gpt-feedback"></div>
  `;
}

// Setup event listeners for the quiz
function setupQuizEventListeners(quizContainer, quizData) {
  // Close button - initially disabled, enabled after answering
  const closeButton = quizContainer.querySelector('#quizme-gpt-close');
  closeButton.addEventListener('click', () => {
    removeExistingQuiz();
  });
  
  // Minimize button
  quizContainer.querySelector('#quizme-gpt-minimize').addEventListener('click', () => {
    const contentElement = quizContainer.querySelector('.quizme-gpt-content');
    contentElement.classList.toggle('quizme-gpt-minimized');
    const minimizeButton = quizContainer.querySelector('#quizme-gpt-minimize');
    minimizeButton.textContent = contentElement.classList.contains('quizme-gpt-minimized') ? '+' : '−';
  });
  
  // Submit button
  quizContainer.querySelector('#quizme-gpt-submit').addEventListener('click', () => {
    if (quizData.type === 'mcq') {
      checkMCQAnswer(quizContainer, quizData);
    } else {
      checkFillBlanksAnswer(quizContainer, quizData);
    }
    
    // Enable the close button after answering
    closeButton.disabled = false;
  });
  
  // Reset button for fill-in-the-blanks
  const resetButton = quizContainer.querySelector('#quizme-gpt-reset');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      resetFillBlanksQuiz(quizContainer);
    });
  }
  
  // Prevent the default escape key behavior
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
    }
  });
}

// Check multiple-choice quiz answer
function checkMCQAnswer(quizContainer, quizData) {
  const selectedOption = quizContainer.querySelector('input[name="quizme-option"]:checked');
  const feedbackElement = quizContainer.querySelector('#quizme-gpt-feedback');
  
  if (!selectedOption) {
    feedbackElement.innerHTML = '<p class="quizme-gpt-error">Please select an answer!</p>';
    return;
  }
  
  const userAnswer = selectedOption.value;
  const isCorrect = userAnswer === quizData.correctAnswer;
  
  if (isCorrect) {
    feedbackElement.innerHTML = '<p class="quizme-gpt-correct">Correct! 🎉</p>';
  } else {
    feedbackElement.innerHTML = `<p class="quizme-gpt-incorrect">Incorrect. The correct answer is ${quizData.correctAnswer}.</p>`;
  }
  
  // Add explanation
  feedbackElement.innerHTML += `<div class="quizme-gpt-explanation"><h3>Explanation:</h3><p>${quizData.explanation}</p></div>`;
  
  // Add "Explain in Depth" button
  feedbackElement.innerHTML += `<div class="quizme-gpt-deep-explain">
    <button id="quizme-gpt-deep-explain-btn" class="quizme-gpt-btn quizme-gpt-secondary-btn">Explain in Depth</button>
    <div id="quizme-gpt-deep-explanation" class="quizme-gpt-deep-explanation-content"></div>
  </div>`;
  
  // Add event listener for the new button
  const deepExplainBtn = quizContainer.querySelector('#quizme-gpt-deep-explain-btn');
  deepExplainBtn.addEventListener('click', () => {
    getDeepExplanation(quizContainer, quizData);
  });
  
  // Disable further submissions
  disableQuizInteraction(quizContainer);
}

// Check fill-in-the-blanks quiz answer
function checkFillBlanksAnswer(quizContainer, quizData) {
  const inputFields = quizContainer.querySelectorAll('.quizme-gpt-input-blank');
  const feedbackElement = quizContainer.querySelector('#quizme-gpt-feedback');
  
  // Check if all input fields have content
  const allFilled = Array.from(inputFields).every(input => input.value.trim() !== '');
  
  if (!allFilled) {
    feedbackElement.innerHTML = '<p class="quizme-gpt-error">Please fill all blanks!</p>';
    return;
  }
  
  // Get user answers
  const userAnswers = Array.from(inputFields).map(input => input.value.trim());
  
  // Compare user answers with correct answers
  const correctAnswers = quizData.correctAnswers || [];
  const isCorrect = userAnswers.every((answer, index) => 
    answer.toLowerCase() === correctAnswers[index].toLowerCase()
  );
  
  if (isCorrect) {
    feedbackElement.innerHTML = '<p class="quizme-gpt-correct">Correct! 🎉</p>';
  } else {
    feedbackElement.innerHTML = '<p class="quizme-gpt-incorrect">Incorrect. See the correct answers below.</p>';
    
    // Show correct answers
    feedbackElement.innerHTML += '<div class="quizme-gpt-correct-answers"><h3>Correct Answers:</h3><ul>';
    correctAnswers.forEach((answer, index) => {
      feedbackElement.innerHTML += `<li>Blank ${index + 1}: ${answer}</li>`;
    });
    feedbackElement.innerHTML += '</ul></div>';
  }
  
  // Add explanation
  feedbackElement.innerHTML += `<div class="quizme-gpt-explanation"><h3>Explanation:</h3><p>${quizData.explanation}</p></div>`;
  
  // Add "Explain in Depth" button
  feedbackElement.innerHTML += `<div class="quizme-gpt-deep-explain">
    <button id="quizme-gpt-deep-explain-btn" class="quizme-gpt-btn quizme-gpt-secondary-btn">Explain in Depth</button>
    <div id="quizme-gpt-deep-explanation" class="quizme-gpt-deep-explanation-content"></div>
  </div>`;
  
  // Add event listener for the new button
  const deepExplainBtn = quizContainer.querySelector('#quizme-gpt-deep-explain-btn');
  deepExplainBtn.addEventListener('click', () => {
    getDeepExplanation(quizContainer, quizData);
  });
  
  // Disable further submissions
  disableQuizInteraction(quizContainer);
}

// Reset fill-in-the-blanks quiz
function resetFillBlanksQuiz(quizContainer) {
  // Clear all input fields
  const inputFields = quizContainer.querySelectorAll('.quizme-gpt-input-blank');
  inputFields.forEach(input => {
    input.value = '';
  });
  
  // Clear feedback
  const feedbackElement = quizContainer.querySelector('#quizme-gpt-feedback');
  feedbackElement.innerHTML = '';
}

// Disable further quiz interaction after submission
function disableQuizInteraction(quizContainer) {
  // Disable radio buttons for MCQ
  const radioButtons = quizContainer.querySelectorAll('input[type="radio"]');
  radioButtons.forEach(radio => {
    radio.disabled = true;
  });
  
  // Disable input fields for fill-in-the-blanks
  const inputFields = quizContainer.querySelectorAll('.quizme-gpt-input-blank');
  inputFields.forEach(input => {
    input.disabled = true;
    input.classList.add('quizme-gpt-disabled');
  });
  
  // Disable submit button
  const submitButton = quizContainer.querySelector('#quizme-gpt-submit');
  submitButton.disabled = true;
  
  // Disable reset button if exists
  const resetButton = quizContainer.querySelector('#quizme-gpt-reset');
  if (resetButton) {
    resetButton.disabled = true;
  }
}

// Make the quiz popup draggable
function makeQuizDraggable(quizContainer) {
  const header = quizContainer.querySelector('.quizme-gpt-header');
  let isDragging = false;
  let offset = { x: 0, y: 0 };
  
  header.addEventListener('mousedown', (e) => {
    if (e.target === header || e.target.tagName === 'H2') {
      isDragging = true;
      offset = {
        x: e.clientX - quizContainer.getBoundingClientRect().left,
        y: e.clientY - quizContainer.getBoundingClientRect().top
      };
    }
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      quizContainer.style.left = (e.clientX - offset.x) + 'px';
      quizContainer.style.top = (e.clientY - offset.y) + 'px';
    }
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

// Format code snippets in text
function formatCodeSnippets(text) {
  if (!text) return '';
  
  // Look for code blocks with triple backticks
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let formattedText = text;
  
  // Replace code blocks with formatted HTML
  formattedText = formattedText.replace(codeBlockRegex, (match, language, code) => {
    const languageClass = language ? ` language-${language}` : '';
    
    // Create line-numbered code
    const lines = code.split('\n');
    const lineNumbersHtml = lines.map(line => 
      `<div class="line">${escapeHtml(line)}</div>`
    ).join('');
    
    return `<div class="quizme-gpt-code quizme-gpt-code-with-line-numbers${languageClass}">${lineNumbersHtml}</div>`;
  });
  
  // Look for inline code with single backticks
  const inlineCodeRegex = /`([^`]+)`/g;
  formattedText = formattedText.replace(inlineCodeRegex, (match, code) => {
    return `<code class="quizme-gpt-inline-code">${escapeHtml(code)}</code>`;
  });
  
  // Format other markdown elements
  
  // Bold text (** or __)
  formattedText = formattedText.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');
  
  // Italic text (* or _)
  formattedText = formattedText.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');
  
  // Links [text](url)
  formattedText = formattedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Bulleted lists (simplified)
  formattedText = formattedText.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  formattedText = formattedText.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Numbered lists (simplified)
  formattedText = formattedText.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  formattedText = formattedText.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
  
  return formattedText;
}

// Helper function to escape HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Remove existing quiz popup
function removeExistingQuiz() {
  const existingQuiz = document.getElementById('quizme-gpt-container');
  const existingOverlay = document.getElementById('quizme-gpt-overlay');
  
  if (existingQuiz) {
    existingQuiz.remove();
  }
  
  if (existingOverlay) {
    existingOverlay.remove();
  }
}

// Helper function to capitalize first letter
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Helper function to escape special regex characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get a deeper explanation from OpenAI API
async function getDeepExplanation(quizContainer, quizData) {
  const deepExplainBtn = quizContainer.querySelector('#quizme-gpt-deep-explain-btn');
  const deepExplanationContainer = quizContainer.querySelector('#quizme-gpt-deep-explanation');
  
  // Show loading state
  deepExplainBtn.disabled = true;
  deepExplainBtn.textContent = 'Loading explanation...';
  deepExplanationContainer.innerHTML = '<div class="quizme-gpt-loading">Generating an in-depth explanation...</div>';
  
  try {
    // Request API key from storage
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);
    
    if (!apiKey) {
      throw new Error('API key not found. Please configure it in the extension settings.');
    }
    
    // Prepare the question and correct answer for OpenAI
    let queryContent = '';
    
    if (quizData.type === 'mcq') {
      const correctOptionIndex = quizData.correctAnswer.charCodeAt(0) - 65; // Convert A,B,C,D to 0,1,2,3
      const correctOptionText = quizData.options[correctOptionIndex];
      
      queryContent = `
Question: ${quizData.question}
Correct Answer: ${quizData.correctAnswer} - ${correctOptionText}
Topic: ${quizData.topic}
      
Provide an in-depth explanation of this concept. Include examples, analogies, and detailed step-by-step explanations that would help someone deeply understand this topic. If it involves code, include more detailed code examples with thorough explanations of how they work.`;
    } else {
      // Handle fill-in-the-blanks
      queryContent = `
Question: ${quizData.question}
Correct Answers: ${quizData.correctAnswers.join(', ')}
Topic: ${quizData.topic}
      
Provide an in-depth explanation of this concept. Include examples, analogies, and detailed step-by-step explanations that would help someone deeply understand this topic. If it involves code, include more detailed code examples with thorough explanations of how they work.`;
    }
    
    // Call OpenAI API for detailed explanation
    const explanation = await fetchDeepExplanation(apiKey, queryContent);
    
    // Display explanation
    deepExplanationContainer.innerHTML = `
      <div class="quizme-gpt-deep-explanation-title">In-Depth Explanation</div>
      <div class="quizme-gpt-deep-explanation-text">${formatCodeSnippets(explanation)}</div>
    `;
    
    // Update button
    deepExplainBtn.textContent = 'Show Simpler Explanation';
    deepExplainBtn.disabled = false;
    
    // Toggle between simple and deep explanations
    const explanationDiv = quizContainer.querySelector('.quizme-gpt-explanation');
    deepExplainBtn.addEventListener('click', () => {
      if (explanationDiv.style.display === 'none') {
        explanationDiv.style.display = 'block';
        deepExplanationContainer.style.display = 'none';
        deepExplainBtn.textContent = 'Explain in Depth';
      } else {
        explanationDiv.style.display = 'none';
        deepExplanationContainer.style.display = 'block';
        deepExplainBtn.textContent = 'Show Simpler Explanation';
      }
    }, { once: true });
    
  } catch (error) {
    console.error('Error fetching deep explanation:', error);
    deepExplanationContainer.innerHTML = `<div class="quizme-gpt-error">Failed to get explanation: ${error.message}</div>`;
    deepExplainBtn.textContent = 'Explain in Depth';
    deepExplainBtn.disabled = false;
  }
}

// Fetch deep explanation from OpenAI API
async function fetchDeepExplanation(apiKey, content) {
  const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
  
  const data = {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: "Ensure that your answer is unbiased and avoids relying on stereotypes. Answer in a natural, human-like manner. Write a detailed text for me by adding all the information necessary. Explain to me as if I'm a beginner. This is very important to my career. I'm going to tip $200 for a better solution! Take a deep breath and work on this step by step. Instruction: As a knowledgeable educator, your task is to explain the following concept to students using multiple real-world examples. Ensure you include corresponding code snippets with expected inputs and outputs. You MUST provide all details accurately, as omissions will be penalized. Finally, create a rhyming catchphrase to aid memorization. Example Concept: Sorting Algorithms. Real-World Examples: Example 1: Organizing books on a shelf by title. Code Snippet: books = [\"The Great Gatsby\", \"1984\", \"To Kill a Mockingbird\"] sorted_books = sorted(books) Expected Input: [\"The Great Gatsby\", \"1984\", \"To Kill a Mockingbird\"] Expected Output: [\"1984\", \"The Great Gatsby\", \"To Kill a Mockingbird\"] Example 2: Arranging numbers in ascending order for a race. Code Snippet: race_times = [12.1, 11.5, 11.9] sorted_times = sorted(race_times) Expected Input: [12.1, 11.5, 11.9] Expected Output: [11.5, 11.9, 12.1] Rhyming Catchphrase: \"To sort with grace, just find your place!\" Now do it for:"
      
      },
      {
        role: 'user',
        content: content
      }
    ],
    temperature: 0.7,
    max_tokens: 4096
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
  return result.choices[0].message.content;
}