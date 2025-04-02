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
});

function filterProfiles() {
    const searchText = document.getElementById('profileSearch').value.toLowerCase();
    const filterType = document.querySelector('.filter-btn.active').getAttribute('data-filter');
    
    const cards = document.querySelectorAll('.profile-card');
    cards.forEach(card => {
        const profileType = card.getAttribute('data-profile-type');
        const profileName = card.getAttribute('data-profile-name');
        
        // Check if the card matches both the search text and filter type
        const matchesSearch = profileName.includes(searchText);
        const matchesType = filterType === 'all' || profileType === filterType;
        
        if (matchesSearch && matchesType) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
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
            // Remove the card from the DOM
            const card = document.querySelector(`.profile-card[data-profile-link="${profileLink}"]`);
            if (card) {
                card.parentElement.removeChild(card);
            } else {
                // If we can't find by link, try by ID
                const cards = document.querySelectorAll('.profile-card');
                cards.forEach(card => {
                    if (card.contains(document.querySelector(`button[onclick*="${profileId}"]`))) {
                        card.parentElement.removeChild(card);
                    }
                });
            }
            
            // Show toast
            const toast = document.getElementById('deleteToast');
            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();
            
            // If no more profiles, refresh the page to show the empty state
            if (document.querySelectorAll('.profile-card').length === 0) {
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
        } else {
            // alert('Failed to remove profile: ' + data.error);
        }
    })
    // .catch(error => {
    //     console.error('Error removing profile:', error);
    //     alert('Network error when removing profile. Please try again.');
    // });
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
                
                const checkbox = document.createElement('div');
                checkbox.className = 'form-check position-absolute top-0 start-0 m-2';
                checkbox.innerHTML = `
                    <input class="form-check-input profile-checkbox" type="checkbox" value="${card.getAttribute('data-profile-name')}" 
                        data-profile-id="${card.getAttribute('data-profile-id')}"
                        data-profile-name="${card.getAttribute('data-profile-name')}"
                        data-profile-institute="${card.getAttribute('data-profile-institute')}">
                `;
                card.querySelector('.card').appendChild(checkbox);
            }
        });
    } else {
        selectionControls.classList.add('d-none');
        normalControls.classList.remove('d-none');
        
        // Remove all checkboxes
        document.querySelectorAll('.profile-checkbox').forEach(checkbox => {
            checkbox.closest('.form-check').remove();
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
            <div>
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

    // console.log(data)

    .then(response => response.json())
    .then(data => {

        console.log(data)

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
            alert('Failed to send profiles: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error sending profiles:', error);
        alert('Network error when sending profiles. Please try again.');
    });
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}