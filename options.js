document.addEventListener('DOMContentLoaded', () => {
  const topicsList = [];
  const topicsContainer = document.getElementById('topics-container');
  const topicInput = document.getElementById('topic-input');
  const topicsHiddenInput = document.getElementById('topics');
  const addTopicBtn = document.getElementById('add-topic-btn');

  // Function to add a topic
  function addTopic(topic) {
    if (!topic) return;
    
    // Check for duplicates
    if (topicsList.includes(topic)) {
      showStatus('This topic is already added', 'error');
      return;
    }
    
    // Add to list
    topicsList.push(topic);
    updateTopicsInput();
    renderTopics();
    topicInput.value = '';
  }
  
  // Function to remove a topic
  function removeTopic(topic) {
    const index = topicsList.indexOf(topic);
    if (index > -1) {
      topicsList.splice(index, 1);
      updateTopicsInput();
      renderTopics();
    }
  }
  
  // Update the hidden input with comma-separated topics
  function updateTopicsInput() {
    topicsHiddenInput.value = topicsList.join(',');
  }
  
  // Render topic tags
  function renderTopics() {
    topicsContainer.innerHTML = '';
    
    if (topicsList.length === 0) {
      topicsContainer.innerHTML = '<p class="empty-topics">No topics added yet</p>';
      return;
    }
    
    topicsList.forEach(topic => {
      const topicTag = document.createElement('div');
      topicTag.className = 'topic-tag';
      
      const topicText = document.createElement('span');
      topicText.className = 'topic-text';
      topicText.textContent = topic;
      
      const removeBtn = document.createElement('span');
      removeBtn.className = 'remove-topic';
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', () => removeTopic(topic));
      
      topicTag.appendChild(topicText);
      topicTag.appendChild(removeBtn);
      topicsContainer.appendChild(topicTag);
    });
  }
  
  // Event listeners for topic input
  addTopicBtn.addEventListener('click', () => {
    addTopic(topicInput.value.trim());
  });
  
  topicInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTopic(topicInput.value.trim());
    }
  });

  // Load saved settings
  chrome.storage.sync.get(
    {
      apiKey: '',
      topics: '',
      quizFrequency: 30,
      mcq: true,
      fillBlanks: true,
      difficulty: 'intermediate'
    },
    (items) => {
      document.getElementById('api-key').value = items.apiKey;
      
      // Load topics
      if (items.topics) {
        const savedTopics = items.topics.split(',').map(t => t.trim());
        savedTopics.forEach(topic => {
          if (topic) topicsList.push(topic);
        });
        updateTopicsInput();
        renderTopics();
      }
      
      document.getElementById('quiz-frequency').value = items.quizFrequency;
      document.getElementById('mcq').checked = items.mcq;
      document.getElementById('fill-blanks').checked = items.fillBlanks;
      document.getElementById('difficulty').value = items.difficulty;
    }
  );

  // Save settings
  document.getElementById('save-btn').addEventListener('click', () => {
    const apiKey = document.getElementById('api-key').value.trim();
    const topics = topicsHiddenInput.value;
    const quizFrequency = parseInt(document.getElementById('quiz-frequency').value, 10);
    const mcq = document.getElementById('mcq').checked;
    const fillBlanks = document.getElementById('fill-blanks').checked;
    const difficulty = document.getElementById('difficulty').value;
    
    // Basic validation
    if (!apiKey) {
      showStatus('Please enter your OpenAI API key', 'error');
      return;
    }
    
    if (!topics) {
      showStatus('Please add at least one topic', 'error');
      return;
    }
    
    if (quizFrequency < 5) {
      showStatus('Quiz frequency must be at least 5 minutes', 'error');
      return;
    }
    
    if (!mcq && !fillBlanks) {
      showStatus('Please select at least one quiz type', 'error');
      return;
    }
    
    // Save settings to chrome.storage
    chrome.storage.sync.set(
      {
        apiKey,
        topics,
        quizFrequency,
        mcq,
        fillBlanks,
        difficulty
      },
      () => {
        // Update alarm for quiz generation
        chrome.runtime.sendMessage({ action: 'updateQuizSchedule' });
        showStatus('Settings saved successfully!', 'success');
      }
    );
  });
  
  function showStatus(message, type) {
    const statusElement = document.getElementById('status-message');
    statusElement.textContent = message;
    statusElement.className = type;
    
    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.className = '';
    }, 3000);
  }
});