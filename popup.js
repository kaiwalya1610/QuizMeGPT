document.addEventListener('DOMContentLoaded', () => {
  const statusElement = document.getElementById('status');
  const nextQuizTimeElement = document.getElementById('next-quiz-time');
  const quizzesTodayElement = document.getElementById('quizzes-today');
  const topicsListElement = document.getElementById('topics-list');
  const generateQuizButton = document.getElementById('generate-quiz-now');
  
  // Function to update topics list display
  function updateTopicsList(topics) {
    if (!topics) {
      topicsListElement.innerHTML = '<span class="empty-topics">No topics set</span>';
      return;
    }
    
    const topicsList = topics.split(',').filter(t => t.trim());
    
    if (topicsList.length === 0) {
      topicsListElement.innerHTML = '<span class="empty-topics">No topics set</span>';
      return;
    }
    
    topicsListElement.innerHTML = '';
    topicsList.forEach(topic => {
      const topicTag = document.createElement('span');
      topicTag.className = 'topic-tag';
      topicTag.textContent = topic.trim();
      topicsListElement.appendChild(topicTag);
    });
  }
  
  // Load and display settings
  chrome.storage.sync.get(
    {
      apiKey: '',
      topics: '',
      quizFrequency: 30,
      quizzesToday: 0,
      lastQuizTime: 0
    },
    (items) => {
      // Check if the extension is properly configured
      if (!items.apiKey || !items.topics) {
        statusElement.textContent = 'Not configured';
        statusElement.style.color = '#e74c3c';
        generateQuizButton.disabled = true;
      } else {
        statusElement.textContent = 'Ready';
        statusElement.style.color = '#27ae60';
        generateQuizButton.disabled = false;
      }
      
      // Display topics
      updateTopicsList(items.topics);
      
      // Display quizzes taken today
      quizzesTodayElement.textContent = items.quizzesToday || 0;
      
      // Calculate and display next quiz time
      if (items.lastQuizTime) {
        const nextQuizTime = new Date(items.lastQuizTime + (items.quizFrequency * 60 * 1000));
        const now = new Date();
        
        if (nextQuizTime > now) {
          const timeDiff = nextQuizTime - now;
          const minutesRemaining = Math.floor(timeDiff / (60 * 1000));
          const secondsRemaining = Math.floor((timeDiff % (60 * 1000)) / 1000);
          nextQuizTimeElement.textContent = `${minutesRemaining}:${secondsRemaining < 10 ? '0' : ''}${secondsRemaining}`;
          
          // Start countdown timer
          startCountdown(nextQuizTime);
        } else {
          nextQuizTimeElement.textContent = 'Due now';
          nextQuizTimeElement.style.color = '#e74c3c';
        }
      } else {
        nextQuizTimeElement.textContent = 'Not scheduled';
      }
    }
  );
  
  // Countdown timer function
  let countdownInterval;
  function startCountdown(targetTime) {
    // Clear any existing interval
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
    
    // Update countdown every second
    countdownInterval = setInterval(() => {
      const now = new Date();
      const timeDiff = targetTime - now;
      
      if (timeDiff <= 0) {
        clearInterval(countdownInterval);
        nextQuizTimeElement.textContent = 'Due now';
        nextQuizTimeElement.style.color = '#e74c3c';
        return;
      }
      
      const minutesRemaining = Math.floor(timeDiff / (60 * 1000));
      const secondsRemaining = Math.floor((timeDiff % (60 * 1000)) / 1000);
      nextQuizTimeElement.textContent = `${minutesRemaining}:${secondsRemaining < 10 ? '0' : ''}${secondsRemaining}`;
    }, 1000);
  }
  
  // Generate quiz now button
  generateQuizButton.addEventListener('click', () => {
    statusElement.textContent = 'Generating...';
    generateQuizButton.disabled = true;
    
    chrome.runtime.sendMessage({ action: 'generateQuizNow' }, (response) => {
      if (response && response.success) {
        window.close(); // Close popup after successful quiz generation
      } else {
        statusElement.textContent = 'Error: ' + (response?.message || 'Failed to generate quiz');
        statusElement.style.color = '#e74c3c';
        generateQuizButton.disabled = false;
      }
    });
  });
  
  // Open options page button
  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // Cleanup when popup is closed
  window.addEventListener('unload', () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
  });
});