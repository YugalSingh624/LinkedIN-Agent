document.addEventListener('DOMContentLoaded', function() {
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