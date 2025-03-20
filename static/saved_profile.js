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