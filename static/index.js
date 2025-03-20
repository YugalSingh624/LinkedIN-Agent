document.addEventListener("DOMContentLoaded", function () {
    const nameInput = document.getElementById("name");
    const emailInput = document.getElementById("email");
    const teacherRadio = document.getElementById("roleTeacher");
    const studentRadio = document.getElementById("roleStudent");
    const warningMessage = document.getElementById("warningMessage");
    const loginForm = document.getElementById("loginForm");
    const roleCards = document.querySelectorAll(".role-card");

    function checkInputs() {
        const nameValue = nameInput.value.trim();
        const emailValue = emailInput.value.trim();
        const roleSelected = teacherRadio.checked || studentRadio.checked;
        
        if (nameValue !== "" && emailValue !== "" && roleSelected) {
            warningMessage.style.display = "none"; // Hide warning
            return true;
        } else {
            return false;
        }
    }

    loginForm.addEventListener("submit", function(event) {
        if (!checkInputs()) {
            event.preventDefault(); // Stop form submission
            warningMessage.style.display = "block"; // Show warning
        }
    });

    // Add event listeners to form elements
    nameInput.addEventListener("input", checkInputs);
    emailInput.addEventListener("input", checkInputs);
    teacherRadio.addEventListener("change", checkInputs);
    studentRadio.addEventListener("change", checkInputs);

    // Role selection logic (visual highlight & selection)
    roleCards.forEach(card => {
        card.addEventListener("click", function () {
            roleCards.forEach(c => c.style.border = "2px solid transparent"); // Reset borders
            this.style.border = "2px solid #198754"; // Highlight selected
            this.querySelector("input").checked = true; // Select input
            checkInputs(); // Trigger input validation after selection
        });
    });
});