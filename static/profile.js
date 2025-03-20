document.addEventListener('DOMContentLoaded', function() {
    // Add click event listeners to connection option buttons
    const connectionButtons = document.querySelectorAll('.select-connection-btn');
    connectionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const connectionType = this.getAttribute('data-type');
            const educationIndex = document.getElementById('education-selector').value;
            startSearch(connectionType, educationIndex);
        });
    });

    // Highlight selected education card when dropdown changes
    const educationSelector = document.getElementById('education-selector');
    if (educationSelector) {
        educationSelector.addEventListener('change', function() {
            // Remove highlight from all education cards
            document.querySelectorAll('.education-card').forEach(card => {
                card.classList.remove('border-primary');
            });
            
            // Add highlight to selected education card
            const selectedIndex = this.value;
            const selectedCard = document.querySelector(`.education-card[data-edu-index="${selectedIndex}"]`);
            if (selectedCard) {
                selectedCard.classList.add('border-primary');
            }
        });
        
        // Trigger change event to highlight the initially selected card
        educationSelector.dispatchEvent(new Event('change'));
    }

    // Initialize Bootstrap toasts
    const toastElList = document.querySelectorAll('.toast');
    const toastList = [...toastElList].map(toastEl => {
        return new bootstrap.Toast(toastEl, {
            autohide: true,
            delay: 3000
        });
    });
});

function startSearch(type, educationIndex) {
    // Update UI to show loading
    document.getElementById('no-selection').style.display = 'none';
    document.getElementById('alumni-error').style.display = 'none';
    document.getElementById('alumni-content').style.display = 'none';
    document.getElementById('alumni-loading').style.display = 'block';
    
    // Update the heading based on selected type
    const headingText = type === 'faculty' ? 'Faculty Members' : 'Students & Alumni';
    document.getElementById('results-heading').innerHTML = `<i class="bi bi-list-ul me-2"></i>${headingText}`;
    
    // Clear previous results
    document.getElementById('alumni-container').innerHTML = '';
    
    // Make API call to start the search
    fetch(`/start_search?type=${type}&education_index=${educationIndex}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Start polling for results
                checkSearchStatus(type, educationIndex);
            } else {
                showError('Failed to start search. Please try again.');
            }
        })
        .catch(error => {
            console.error('Error starting search:', error);
            showError('Network error. Please try again later.');
        });
}

function checkSearchStatus(type, educationIndex) {
    fetch(`/check_search_status?type=${type}&education_index=${educationIndex}`)
        .then(response => response.json())
        .then(data => {
            if (data.completed) {
                // Search is complete, show the results
                displayResults(data.results, type, educationIndex);
            } else {
                // Still searching, check again in 2 seconds
                setTimeout(() => checkSearchStatus(type, educationIndex), 2000);
            }
        })
        .catch(error => {
            console.error('Error checking search status:', error);
            showError('Failed to load profiles. Please try again later.');
        });
}

function displayResults(profiles, type, educationIndex) {
    // Hide the loading spinner
    document.getElementById('alumni-loading').style.display = 'none';
    
    // No profiles found
    if (!profiles || profiles.length === 0) {
        showError(`No ${type === 'faculty' ? 'faculty members' : 'students'} found. Try broadening your search.`);
        return;
    }
    
    // Get selected institution information
    const selector = document.getElementById('education-selector');
    const selectedText = selector.options[selector.selectedIndex].text;
    
    // Update search info text
    const searchInfoElement = document.getElementById('search-info');
    searchInfoElement.textContent = `Showing ${type === 'faculty' ? 'faculty' : 'students'} from ${selectedText}`;
    
    // Populate the results container
    const container = document.getElementById('alumni-container');
    
    // Get the institution from the selected education option
    const institutionElements = document.querySelectorAll('.institution-name');
    const institute = institutionElements[educationIndex] ? institutionElements[educationIndex].textContent : '';
    
    profiles.forEach(profile => {
        const col = document.createElement('div');
        col.className = 'col';
        
        // Check if profile is already saved to display the correct button
        const saveButtonClass = profile.is_saved ? 'btn-success' : 'btn-outline-success';
        const saveButtonIcon = profile.is_saved ? 'bi-bookmark-check-fill' : 'bi-bookmark-plus';
        const saveButtonText = profile.is_saved ? 'Saved' : 'Save Profile';
        const saveButtonAction = profile.is_saved ? 
            `onclick="removeProfile('${profile.name}', '${profile.link}')"` : 
            `onclick="saveProfile('${profile.name}', '${profile.link}', '${type}', '${institute}')"`;
        
        col.innerHTML = `
            <div class="card h-100 border-0 shadow-lg" style="box-shadow: 0 4px 8px rgba(0,0,0,0.2);">
                <div class="card-body text-center">
                    <i class="bi bi-person-circle text-primary" style="font-size: 3rem;"></i>
                    <h5 class="mt-3 mb-3">${profile.name}</h5>
                    <div class="mt-3 d-flex flex-column gap-2">
                        <a href="${profile.link}" target="_blank" class="btn btn-outline-primary btn-sm">
                            <i class="bi bi-person-badge me-2"></i>View Profile
                        </a>
                        <button class="btn ${saveButtonClass} btn-sm save-profile-btn" 
                                data-profile-name="${profile.name}" 
                                data-profile-link="${profile.link}"
                                ${saveButtonAction}>
                            <i class="bi ${saveButtonIcon} me-2"></i>${saveButtonText}
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(col);
    });
    
    // Show the alumni content
    document.getElementById('alumni-content').style.display = 'block';
}

function saveProfile(name, link, type, institute) {
    fetch('/save_profile', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: name,
            link: link,
            type: type,
            institute: institute
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update the button to show it's saved
            const buttons = document.querySelectorAll(`.save-profile-btn[data-profile-link="${link}"]`);
            buttons.forEach(button => {
                button.className = 'btn btn-success btn-sm save-profile-btn';
                button.innerHTML = '<i class="bi bi-bookmark-check-fill me-2"></i>Saved';
                button.onclick = () => removeProfile(name, link);
            });
            
            // Show success toast
            const toast = document.getElementById('saveToast');
            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();
        } else {
            // alert('Failed to save profile: ' + data.error);
        }
    })
    // .catch(error => {
    //     console.error('Error saving profile:', error);
    //     alert('Network error when saving profile. Please try again.');
    // });
}

function removeProfile(name, link) {
    if (!confirm('Are you sure you want to remove this saved profile?')) {
        return;
    }
    
    fetch('/remove_profile', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            link: link
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update the button to show it's not saved
            const buttons = document.querySelectorAll(`.save-profile-btn[data-profile-link="${link}"]`);
            buttons.forEach(button => {
                button.className = 'btn btn-outline-success btn-sm save-profile-btn';
                button.innerHTML = '<i class="bi bi-bookmark-plus me-2"></i>Save Profile';
                
                // Get the current search type and institute
                const type = document.querySelector('#results-heading').textContent.includes('Faculty') ? 'faculty' : 'students';
                
                // Get the selected education institution
                const selector = document.getElementById('education-selector');
                const educationIndex = selector.value;
                const institutionElements = document.querySelectorAll('.institution-name');
                const institute = institutionElements[educationIndex] ? institutionElements[educationIndex].textContent : '';
                
                button.onclick = () => saveProfile(name, link, type, institute);
            });
            
            // Update toast message
            document.querySelector('.toast-header strong').textContent = 'Profile Removed';
            document.querySelector('.toast-body').textContent = 'Profile has been removed from your saved profiles.';
            document.querySelector('.toast-header i').className = 'bi bi-x-circle-fill text-danger me-2';
            
            // Show toast
            const toast = document.getElementById('saveToast');
            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();
        } else {
            // alert('Failed to remove profile: ' + data.error);
        }
    })
    // .catch(error => {
    //     console.error('Error removing profile:', error);
    //     alert('Network error when removing profile. Please try again.');
    // });
}

function showError(message) {
    document.getElementById('alumni-loading').style.display = 'none';
    document.getElementById('alumni-error').style.display = 'block';
    document.getElementById('error-message').textContent = message;
}

// Logout handler in profile.html
document.addEventListener('DOMContentLoaded', function() {
    // Find the logout link
    const logoutLink = document.querySelector('a[href="/logout"]');
    
    if (logoutLink) {
        logoutLink.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Create a form to post to logout (POST is better for logout actions)
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/logout';
            
            // Add CSRF token if you're using it
            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = 'csrf_token';
            csrfInput.value = '{{ csrf_token }}';  // If you're using Flask-WTF
            form.appendChild(csrfInput);
            
            document.body.appendChild(form);
            form.submit();
        });
    }
});