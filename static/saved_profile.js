document.addEventListener('DOMContentLoaded', function() {
    // Set up toggle view functionality
    const toggleViewBtn = document.getElementById('toggleViewBtn');
    const networkSection = document.getElementById('network-section');
    const savedProfilesSection = document.getElementById('saved-profiles-section');
    const pageTitle = document.getElementById('page-title');
    const pageDescription = document.getElementById('page-description');
    
    if (toggleViewBtn) {
        toggleViewBtn.addEventListener('click', function() {
            const isShowingProfiles = savedProfilesSection.style.display !== 'none';
            
            if (isShowingProfiles) {
                // Switch to network view
                savedProfilesSection.style.display = 'none';
                networkSection.style.display = 'block';
                toggleViewBtn.innerHTML = '<i class="bi bi-bookmark-star me-1"></i>Show Saved Profiles';
                pageTitle.textContent = 'Connect With Your Network';
                pageDescription.textContent = 'Find and connect with professionals from your institutions';
            } else {
                // Switch to saved profiles view
                savedProfilesSection.style.display = 'block';
                networkSection.style.display = 'none';
                toggleViewBtn.innerHTML = '<i class="bi bi-people me-1"></i>Find Connections';
                pageTitle.textContent = 'Saved Profiles';
                pageDescription.textContent = 'Profiles you\'ve saved for future reference';
            }
            
            // If we're displaying the network section, make sure the connection cards are initialized
            if (!isShowingProfiles && typeof initDynamicConnectionCards === 'function') {
                initDynamicConnectionCards();
            }
        });
    }
    
    // Set up filter buttons
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            filterButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            // Apply filter
            filterProfiles();
        });
    });
    
    // Initialize Bootstrap toasts
    const toastElList = document.querySelectorAll('.toast');
    const toastList = [...toastElList].map(toastEl => {
        return new bootstrap.Toast(toastEl, {
            autohide: true,
            delay: 3000
        });
    });

    // Initialize the selection mode when needed
    document.getElementById('startSelectionBtn').addEventListener('click', function() {
        toggleSelectionMode(true);
    });

    document.getElementById('cancelSelectionBtn').addEventListener('click', function() {
        toggleSelectionMode(false);
    });

    document.getElementById('sendSelectedBtn').addEventListener('click', function() {
        openEmailModal();
    });
    
    // Add resize handler for responsive adjustments
    window.addEventListener('resize', handleResponsiveAdjustments);
    // Call once on load
    handleResponsiveAdjustments();
    
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
            document.querySelectorAll('.education-card, .experience-card').forEach(card => {
                card.classList.remove('border-primary');
            });
            
            // Add highlight to selected education or experience card
            const selectedIndex = this.value;
            const selectedCard = document.querySelector(`.education-card[data-edu-index="${selectedIndex}"], .experience-card[data-exp-index="${selectedIndex}"]`);
            if (selectedCard) {
                selectedCard.classList.add('border-primary');
            }
        });
        
        // Trigger change event to highlight the initially selected card
        educationSelector.dispatchEvent(new Event('change'));
    }
    
    // Add event listener for the save remark button in the modal
    document.getElementById('saveRemarkBtn').addEventListener('click', function() {
        const name = document.getElementById('remarkProfileName').value;
        const link = document.getElementById('remarkProfileLink').value;
        const type = document.getElementById('remarkProfileType').value;
        const institute = document.getElementById('remarkProfileInstitute').value;
        const remark = document.getElementById('profileRemark').value;
        
        // Save the profile with the remark
        saveProfile(name, link, type, institute, remark);
        
        // Close the modal
        const remarkModal = bootstrap.Modal.getInstance(document.getElementById('remarkModal'));
        remarkModal.hide();
    });
    
    // Set up event delegation for dynamically created buttons
    const alumniContainer = document.getElementById('alumni-container');
    if (alumniContainer) {
        alumniContainer.addEventListener('click', function(event) {
            // Check if the clicked element is a save profile button or its child
            const saveButton = event.target.closest('.save-profile-btn');
            if (saveButton) {
                const name = saveButton.getAttribute('data-profile-name');
                const link = saveButton.getAttribute('data-profile-link');
                const type = saveButton.getAttribute('data-profile-type');
                const institute = saveButton.getAttribute('data-profile-institute');
                
                if (saveButton.classList.contains('btn-success')) {
                    // Already saved, remove it
                    removeProfile(name, link);
                } else {
                    // Not saved, open modal
                    openRemarkModal(name, link, type, institute);
                }
            }
        });
    }
    
    // Initialize dynamic connection cards
    initDynamicConnectionCards();
});

// Handle any special responsive adjustments that can't be done with CSS alone
function handleResponsiveAdjustments() {
    const isMobile = window.innerWidth < 576;
    
    // Adjust email modal on small screens
    if (isMobile) {
        document.querySelector('#emailModal .modal-dialog').classList.add('modal-fullscreen-sm-down');
    } else {
        document.querySelector('#emailModal .modal-dialog').classList.remove('modal-fullscreen-sm-down');
    }
    
    // Ensure toast notifications are properly positioned on mobile
    const toasts = document.querySelectorAll('.toast');
    toasts.forEach(toast => {
        if (isMobile) {
            toast.closest('.position-fixed').classList.add('w-100');
        } else {
            toast.closest('.position-fixed').classList.remove('w-100');
        }
    });
}

function filterProfiles() {
    const searchText = document.getElementById('profileSearch').value.toLowerCase();
    const filterType = document.querySelector('.filter-btn.active').getAttribute('data-filter');
    
    const cards = document.querySelectorAll('.profile-card');
    let visibleCount = 0;
    
    cards.forEach(card => {
        const profileType = card.getAttribute('data-profile-type');
        const profileName = card.getAttribute('data-profile-name').toLowerCase();
        const profileInstitute = card.getAttribute('data-profile-institute').toLowerCase();
        
        // Enhanced search - check name and institute
        const matchesSearch = profileName.includes(searchText) || profileInstitute.includes(searchText);
        const matchesType = filterType === 'all' || profileType === filterType;
        
        if (matchesSearch && matchesType) {
            card.style.display = '';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });
    
    // Show a "no results" message if needed
    let noResultsEl = document.getElementById('no-search-results');
    if (visibleCount === 0) {
        if (!noResultsEl) {
            noResultsEl = document.createElement('div');
            noResultsEl.id = 'no-search-results';
            noResultsEl.className = 'col-12 text-center py-4';
            noResultsEl.innerHTML = `
                <i class="bi bi-search text-muted" style="font-size: 2rem;"></i>
                <p class="mt-3 text-muted">No profiles match your search criteria</p>
            `;
            document.getElementById('saved-profiles-container').appendChild(noResultsEl);
        }
        noResultsEl.style.display = '';
    } else if (noResultsEl) {
        noResultsEl.style.display = 'none';
    }
}

function removeProfileFromSaved(profileId, profileLink) {
    if (!confirm('Are you sure you want to remove this saved profile?')) {
        return;
    }
    
    fetch('/remove_profile', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            link: profileLink
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Find the card to remove
            let cardToRemove = null;
            const cards = document.querySelectorAll('.profile-card');
            
            // Try finding by link (most reliable)
            cards.forEach(card => {
                if (card.getAttribute('data-profile-id') === profileLink) {
                    cardToRemove = card;
                }
            });
            
            // If not found by link, try finding by profileId
            if (!cardToRemove) {
                cards.forEach(card => {
                    if (card.contains(document.querySelector(`button[onclick*="${profileId}"]`))) {
                        cardToRemove = card;
                    }
                });
            }
            
            // Remove the card with fade effect
            if (cardToRemove) {
                cardToRemove.style.transition = 'opacity 0.3s';
                cardToRemove.style.opacity = '0';
                setTimeout(() => {
                    cardToRemove.remove();
                    
                    // If no more profiles, refresh the page to show the empty state
                    if (document.querySelectorAll('.profile-card').length === 0) {
                        window.location.reload();
                    } else {
                        // Re-filter to update display
                        filterProfiles();
                    }
                }, 300);
            }
            
            // Show toast
            const toast = document.getElementById('deleteToast');
            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();
        } else {
            console.error('Failed to remove profile:', data.error);
        }
    })
    .catch(error => {
        console.error('Error removing profile:', error);
    });
}

// Selection mode functions
function toggleSelectionMode(enable) {
    const selectionControls = document.getElementById('selectionControls');
    const normalControls = document.getElementById('normalControls');
    const profileCards = document.querySelectorAll('.profile-card');
    
    if (enable) {
        selectionControls.classList.remove('d-none');
        normalControls.classList.add('d-none');
        
        // Add checkboxes to cards
        profileCards.forEach(card => {
            // Get user role - with null check and fallback
            const userRoleElement = document.querySelector('.container[data-user-role]');
            const userRole = userRoleElement ? (userRoleElement.getAttribute('data-user-role') || '').toLowerCase() : '';
            
            const profileType = card.getAttribute('data-profile-type');
            
            // Students can only select faculty, faculty can only select students
            if ((userRole.includes('student') && profileType === 'faculty') || 
                (isTeacherRole(userRole) && profileType === 'students')) {
                
                // Only add checkbox if not already there
                if (!card.querySelector('.profile-checkbox')) {
                    const checkbox = document.createElement('div');
                    checkbox.className = 'form-check position-absolute top-0 start-0 m-2 z-1';
                    checkbox.innerHTML = `
                        <input class="form-check-input profile-checkbox" type="checkbox" value="${card.getAttribute('data-profile-name')}" 
                            data-profile-id="${card.getAttribute('data-profile-id')}"
                            data-profile-name="${card.getAttribute('data-profile-name')}"
                            data-profile-institute="${card.getAttribute('data-profile-institute')}">
                    `;
                    card.querySelector('.card').appendChild(checkbox);
                    
                    // Make the whole card clickable to toggle checkbox on mobile
                    card.querySelector('.card').addEventListener('click', function(e) {
                        // Don't toggle if clicking on buttons or links
                        if (!e.target.closest('a') && !e.target.closest('button') && !e.target.closest('.form-check')) {
                            const checkbox = this.querySelector('.profile-checkbox');
                            checkbox.checked = !checkbox.checked;
                        }
                    });
                }
            }
        });
    } else {
        selectionControls.classList.add('d-none');
        normalControls.classList.remove('d-none');
        
        // Remove all checkboxes and event listeners
        document.querySelectorAll('.profile-checkbox').forEach(checkbox => {
            const card = checkbox.closest('.card');
            // Remove the click event by cloning and replacing
            const newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);
            // Remove checkbox
            newCard.querySelector('.form-check')?.remove();
        });
    }
}

function isTeacherRole(role) {
    const teacherRoles = ['teacher', 'professor', 'principal', 'faculty'];
    return teacherRoles.some(teacherRole => role.includes(teacherRole));
}

function openEmailModal() {
    // Get selected profiles
    const selectedProfiles = Array.from(document.querySelectorAll('.profile-checkbox:checked')).map(checkbox => {
        return {
            name: checkbox.getAttribute('data-profile-name'),
            institute: checkbox.getAttribute('data-profile-institute')
        };
    });
    
    if (selectedProfiles.length === 0) {
        alert('Please select at least one profile to share.');
        return;
    }
    
    // Populate the modal with selected profiles
    const profileList = document.getElementById('selectedProfilesList');
    profileList.innerHTML = '';
    
    selectedProfiles.forEach(profile => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `
            <div class="text-break">
                <strong>${profile.name}</strong>
                <small class="d-block text-muted">${profile.institute}</small>
            </div>
        `;
        profileList.appendChild(li);
    });
    
    // Show the modal
    const emailModal = new bootstrap.Modal(document.getElementById('emailModal'));
    emailModal.show();
}

function sendProfilesList() {
    const emailAddress = document.getElementById('emailAddress').value;
    const emailSubject = document.getElementById('emailSubject').value;
    const emailMessage = document.getElementById('emailMessage').value;
    
    if (!emailAddress || !validateEmail(emailAddress)) {
        alert('Please enter a valid email address.');
        return;
    }
    
    // Show loading state
    const sendButton = document.querySelector('.modal-footer .btn-primary');
    const originalText = sendButton.innerHTML;
    sendButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Sending...';
    sendButton.disabled = true;
    
    // Get selected profiles
    const selectedProfiles = Array.from(document.querySelectorAll('.profile-checkbox:checked')).map(checkbox => {
        return {
            Link: checkbox.getAttribute('data-profile-id'),
            name: checkbox.getAttribute('data-profile-name'),
            institute: checkbox.getAttribute('data-profile-institute')
        };
    });
    
    // Send the data to the server
    fetch('/send_profiles_list', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: emailAddress,
            subject: emailSubject,
            message: emailMessage,
            profiles: selectedProfiles
        })
    })
    .then(response => response.json())
    .then(data => {
        // Reset button state
        sendButton.innerHTML = originalText;
        sendButton.disabled = false;
        
        if (data.success) {
            // Hide the modal
            const emailModal = bootstrap.Modal.getInstance(document.getElementById('emailModal'));
            emailModal.hide();
            
            // Show success toast
            const toast = document.getElementById('emailToast');
            const toastBody = toast.querySelector('.toast-body');
            toastBody.textContent = 'Profiles list has been sent successfully!';
            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();
            
            // Exit selection mode
            toggleSelectionMode(false);
        } else {
            alert('Failed to send profiles: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error sending profiles:', error);
        alert('Network error when sending profiles. Please try again.');
        
        // Reset button state
        sendButton.innerHTML = originalText;
        sendButton.disabled = false;
    });
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Connection search functions
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
    
    // Scroll to results section for mobile
    const resultsHeading = document.getElementById('results-heading');
    if (resultsHeading && window.innerWidth < 768) {
        setTimeout(() => {
            resultsHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }
    
    // Make API call to start the search
    fetch(`/start_search?type=${type}&education_index=${educationIndex}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
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
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
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
    searchInfoElement.textContent = `Showing ${profiles.length} ${type === 'faculty' ? 'faculty' : 'students'} from ${selectedText}`;
    
    // Populate the results container
    const container = document.getElementById('alumni-container');
    container.innerHTML = ''; // Clear previous results
    
    // Get the institution from the selected education option
    const institute = selectedText.split(' - ')[0].trim();
    
    profiles.forEach(profile => {
        const col = document.createElement('div');
        col.className = 'col';
        
        // Check if profile is already saved to display the correct button
        const saveButtonClass = profile.is_saved ? 'btn-success' : 'btn-outline-success';
        const saveButtonIcon = profile.is_saved ? 'bi-bookmark-check-fill' : 'bi-bookmark-plus';
        const saveButtonText = profile.is_saved ? 'Saved' : 'Save';
        
        col.innerHTML = `
            <div class="card h-100 border-0 shadow-sm alumni-card">
                <div class="card-body text-center d-flex flex-column">
                    <i class="bi bi-person-circle text-primary mb-3 alumni-pic" style="font-size: 3rem;"></i>
                    <h5 class="mb-3">${profile.name}</h5>
                    <div class="mt-auto d-flex flex-column gap-2">
                        <a href="${profile.link}" target="_blank" class="btn btn-outline-primary btn-sm action-btn">
                            <i class="bi bi-person-badge me-2"></i>Connect
                        </a>
                        <button class="btn ${saveButtonClass} btn-sm save-profile-btn action-btn" 
                                data-profile-name="${profile.name}" 
                                data-profile-link="${profile.link}"
                                data-profile-type="${type}"
                                data-profile-institute="${institute}">
                            <i class="bi ${saveButtonIcon} me-2"></i>${saveButtonText}
                        </button>
                        ${profile.remark ? `<div class="mt-2 text-muted small border-top pt-2">
                                <strong>Note:</strong> ${profile.remark}
                            </div>` : ''}
                    </div>
                </div>
            </div>
        `;
        container.appendChild(col);
    });
    
    // Show the alumni content
    document.getElementById('alumni-content').style.display = 'block';
}

function openRemarkModal(name, link, type, institute) {
    // Set the values in the hidden fields
    document.getElementById('remarkProfileName').value = name;
    document.getElementById('remarkProfileLink').value = link;
    document.getElementById('remarkProfileType').value = type;
    document.getElementById('remarkProfileInstitute').value = institute;
    
    // Clear any previous remarks
    document.getElementById('profileRemark').value = '';
    
    // Set the profile name in the modal title
    document.getElementById('remarkModalLabel').innerHTML = `Add a Remark for ${name}`;
    
    // Show the modal
    const remarkModal = new bootstrap.Modal(document.getElementById('remarkModal'));
    remarkModal.show();
}

function saveProfile(name, link, type, institute, remark = '') {
    // Show loading state
    const saveBtn = document.getElementById('saveRemarkBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving...';
    saveBtn.disabled = true;
    
    fetch('/save_profile', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: name,
            link: link,
            type: type,
            institute: institute,
            remark: remark
        })
    })  
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        // Reset button state
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
        
        if (data.success) {
            // Update the button to show it's saved
            const buttons = document.querySelectorAll(`.save-profile-btn[data-profile-link="${link}"]`);
            buttons.forEach(button => {
                const parentCard = button.closest('.card-body');
                
                // Update button appearance
                button.className = 'btn btn-success btn-sm save-profile-btn action-btn';
                button.innerHTML = '<i class="bi bi-bookmark-check-fill me-2"></i>Saved';
                
                // Update data attributes to maintain consistency
                button.setAttribute('data-profile-name', name);
                button.setAttribute('data-profile-link', link);
                button.setAttribute('data-profile-type', type);
                button.setAttribute('data-profile-institute', institute);
                
                // Add remark to the card if provided
                if (remark && remark.trim() !== '') {
                    // Check if remark display already exists
                    let remarkDisplay = parentCard.querySelector('.text-muted.small.border-top');
                    if (!remarkDisplay) {
                        // Create a new remark display
                        remarkDisplay = document.createElement('div');
                        remarkDisplay.className = 'mt-2 text-muted small border-top pt-2';
                        remarkDisplay.innerHTML = `<strong>Note:</strong> ${remark}`;
                        parentCard.querySelector('.d-flex.flex-column').appendChild(remarkDisplay);
                    } else {
                        // Update existing remark display
                        remarkDisplay.innerHTML = `<strong>Note:</strong> ${remark}`;
                    }
                }
            });
            
            // Show success toast
            const toast = document.getElementById('saveToast');
            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();
        } else {
            console.error('Failed to save profile:', data.error);
            alert('Failed to save profile: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        // Reset button state
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
        
        console.error('Error saving profile:', error);
        alert('Network error when saving profile. Please try again.');
    });
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
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Update the button to show it's not saved
            const buttons = document.querySelectorAll(`.save-profile-btn[data-profile-link="${link}"]`);
            buttons.forEach(button => {
                const parentCard = button.closest('.card-body');
                
                // Get the current type and institute from data attributes
                const type = button.getAttribute('data-profile-type');
                const institute = button.getAttribute('data-profile-institute');
                
                // Update button appearance
                button.className = 'btn btn-outline-success btn-sm save-profile-btn action-btn';
                button.innerHTML = '<i class="bi bi-bookmark-plus me-2"></i>Save';
                
                // Remove any remark display
                const remarkDisplay = parentCard.querySelector('.text-muted.small.border-top');
                if (remarkDisplay) {
                    remarkDisplay.remove();
                }
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
            console.error('Failed to remove profile:', data.error);
            alert('Failed to remove profile: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error removing profile:', error);
        alert('Network error when removing profile. Please try again.');
    });
}

function showError(message) {
    document.getElementById('alumni-loading').style.display = 'none';
    document.getElementById('alumni-error').style.display = 'block';
    document.getElementById('error-message').textContent = message;
}

function initDynamicConnectionCards() {
    const userRole = document.querySelector('body').getAttribute('data-role') || '';
    const connectionCardsContainer = document.getElementById('connection-cards');
    
    // Early return if container doesn't exist
    if (!connectionCardsContainer) return;

    const connectionCards = [
        {
            type: 'faculty',
            icon: 'bi-person-workspace',
            title: 'Faculty',
            description: 'Connect with professors and teachers from your institution',
            buttonText: 'Find Faculty'
        },
        {
            type: 'students',
            icon: 'bi-mortarboard',
            title: 'Students',
            description: 'Connect with students and alumni from your institution',
            buttonText: 'Find Students'
        }
    ];

    // Reorder cards based on user role
    let orderedCards = connectionCards;
    if (['teacher', 'professor', 'principal'].includes(userRole.toLowerCase())) {
        // For teachers, swap faculty and students
        orderedCards = [
            connectionCards[1],  // Students card
            connectionCards[0]   // Faculty card
        ];
    }

    // Clear the container to avoid duplicates
    connectionCardsContainer.innerHTML = '';

    // Render cards
    orderedCards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = 'col';
        cardElement.innerHTML = `
        <div class="card h-100 border-0 shadow-sm connection-option" data-type="${card.type}">
            <div class="card-body text-center p-3 p-md-4 d-flex flex-column">
                <div class="icon-circle mb-3 mx-auto">
                    <i class="bi ${card.icon}"></i>
                </div>
                <h3 class="card-title fs-5 fs-md-4 mb-2">${card.title}</h3>
                <p class="card-text text-muted small">${card.description}</p>
                <div class="mt-auto pt-3">
                    ${card.link ?
                `<a href="${card.link}" class="btn btn-outline-warning w-100">
                            <i class="bi bi-bookmark me-2"></i>${card.buttonText}
                        </a>` :
                `<button class="btn btn-outline-primary w-100 select-connection-btn" data-type="${card.type}">
                            <i class="bi bi-search me-2"></i>${card.buttonText}
                        </button>`
            }
                </div>
            </div>
        </div>
    `;
        connectionCardsContainer.appendChild(cardElement);
    });
    
    // Re-attach event listeners to the newly created buttons
    const newConnectionButtons = connectionCardsContainer.querySelectorAll('.select-connection-btn');
    newConnectionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const connectionType = this.getAttribute('data-type');
            const educationIndex = document.getElementById('education-selector').value;
            startSearch(connectionType, educationIndex);
        });
    });
}