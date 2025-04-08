from flask import Flask, render_template, redirect, request, session, url_for, flash, jsonify
import requests
import os
import re
import pymongo
import uuid
from bson.objectid import ObjectId
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import atexit
from dotenv import load_dotenv


load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("secret_key")  # Change this in production
# app.secret_key = "your_secret_key"
#lix_it_api

BASE_URL = os.getenv("BASE_URL") # for invitation

lix_it_api = os.getenv("lix_it_key")

# LinkedIn API Credentials (Move these to environment variables in production)
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI")

# LinkedIn API URLs
AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
PROFILE_URL = "https://api.linkedin.com/v2/userinfo"

# 869227b57ce8e46dd
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
CSE_ID = os.getenv("CSE_ID")   # Your Google Custom Search Engine ID
GOOGLE_SEARCH_URL = "https://www.googleapis.com/customsearch/v1"

# MongoDB Atlas Connection
MONGO_URI = os.getenv("MONGO_URI")
mongo_client = pymongo.MongoClient(MONGO_URI)
db = mongo_client["profiledb"]
saved_profiles_collection = db["saved_profiles"]

# Store for background tasks
background_tasks = {}

# Create a thread pool executor
executor = ThreadPoolExecutor(max_workers=5)

def extract_name_from_url(url):
    """
    Extract name from LinkedIn profile URL
    """
    match = re.search(r'linkedin\.com/in/([a-zA-Z0-9-]+)', url)
    if match:
        name_part = match.group(1).rsplit('-', 1)[0]  # Remove trailing ID
        name = name_part.replace("-", " ").title()  # Convert to Title Case
        return name
    return "LinkedIn Profile"  # Default name if extraction fails

@app.route("/")
def home():
    # Check if coming from logout - if so, make sure we don't have active session data
    if 'logout_token' in session:
        # Remove the token
        session.pop('logout_token', None)
        # Clear any remaining session data
        session.clear()
    
    # Get invite token if present
    invite_token = request.args.get("invite")
    
    if invite_token:
        # Store in session temporarily
        session["invite_token"] = invite_token
    
    linkedin_auth_url = (
        f"{AUTH_URL}?response_type=code&client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}&scope=openid%20profile%20email"
    )
    
    # Pass the invite status to the template
    return render_template("index.html", linkedin_auth_url=linkedin_auth_url, invite=bool(invite_token))

@app.route("/handle_login", methods=["POST"])
def handle_login():
    """
    Handles form-based login from index.html.
    """
    education = request.form.get("name")
    role = request.form.get("role")  # Get the user's role

    if not education or not role:
        flash("Please enter all required information.", "danger")
        return redirect(url_for("home"))

    # Store in session
    session["education"] = education
    session["role"] = role  # Store the role in the session
    
    # Check if this login was from an invitation
    invite_token = session.get("invite_token")
    
    flash("Login successful!", "success")
    return redirect(
        f"{AUTH_URL}?response_type=code&client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}&scope=openid%20profile%20email"
    )

def perform_connection_search(user_id, name, role, search_key, start_date, end_date, location=" ", is_teacher=False):
    """
    Background task to perform connection search based on type
    """
    try:
        # If we have multiple entries, use the first one for search
        if isinstance(name, list):
            name = name[0]
        
        if location == "N/A":
            location = ""

        # Build query based on whether it's a teacher (experience-based) or student (education-based)
        if is_teacher:
            # For teachers searching based on organization experience
            if "faculty" in search_key:
                # Looking for faculty members in the same organization
                query = f'site:linkedin.com/in "{name}" "{role}" "{location}"'
            else:
                # Looking for students/alumni who might be connected to this organization
                query = f'site:linkedin.com/in "{name}"  "Student" "{location}"'
        else:
            # For students searching based on education
            if "faculty" in search_key:
                query = f'site:linkedin.com/in "{name}" "professor"'
            else:  # students
                query = f'site:linkedin.com/in "{name}" "{role}" "{start_date}" "{end_date}"'
        
        # Pass the search_type to connection_search

        print("Query is:", query)
        
        urls = connection_search(query, search_key)

        # print("Urls Are: ", urls)
        
        results = []
        for url in urls:
            profile_name = extract_name_from_url(url)
            results.append({
                "name": profile_name,
                "link": url,
                "profile_type": "faculty" if "faculty" in search_key else "student",
                "institute": name  # This will be either institution name or organization name
            })
        
        # Store the results in the background_tasks dictionary
        background_tasks[user_id][search_key] = {
            "completed": True,
            "results": results
        }


        print("Final Profiles are:", results)
    except Exception as e:
        print(f"Error in search thread: {e}")
        # Make sure we mark as completed even on error
        background_tasks[user_id][search_key] = {
            "completed": True,
            "results": [],
            "error": str(e)
        }

@app.route("/callback")
def callback():
    """
    Handles LinkedIn OAuth callback.
    """
    # Check if user explicitly logged out
    if session.get("logged_out"):
        # Clear the flag
        session.pop("logged_out", None)
        # Redirect to home with message
        flash("You have been logged out. Please log in again to continue.", "info")
        return redirect(url_for("home"))
    
    # Rest of the callback logic...
    
    code = request.args.get("code")
    if not code:
        return "Error: No authorization code received", 400

    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
    
    try:
        response = requests.post(TOKEN_URL, data=data)
        response.raise_for_status()
        token_json = response.json()

        access_token = token_json.get("access_token")

        if not access_token:
            return "Error: No access token received", 400

        headers = {"Authorization": f"Bearer {access_token}"}
        profile_response = requests.get(PROFILE_URL, headers=headers)
        profile_data = profile_response.json()
        
        # Extract user details safely
        session["first_name"] = profile_data.get("given_name", "Unknown")
        session["last_name"] = profile_data.get("family_name", "Unknown")
        session["email"] = profile_data.get("email", "Not Available")
        
        session["linkedin_url"] = session["education"]

        # Fetch education and experience details
        education_details, experience_details = fetch_education_experience_details(session["linkedin_url"])
        session["education_details"] = education_details
        session["experience_details"] = experience_details

        # Generate a unique user ID for tracking the background task
        user_id = str(hash(f"{session['first_name']}{session['last_name']}{session['email']}"))
        session["user_id"] = user_id

        # Profile picture (check if exists)
        profile_picture = profile_data.get("picture")
        if profile_picture:
            session["profile_picture"] = profile_picture
            download_image(profile_picture)
        else:
            session["profile_picture"] = "static/default.jpg"

        # Initialize background tasks for this user
        background_tasks[user_id] = {}
        
        # Now check if there was an invite token and process it
        invite_token = session.pop("invite_token", None)
        
        if invite_token:
            try:
                # Find the invitation in database
                invite = db.invites.find_one({'token': invite_token, 'used': False})
                
                if invite:
                    # Record this as a successful referral in the user's profile
                    db.users.update_one(
                        {'user_id': user_id}, 
                        {
                            '$set': {
                                'referred_by': invite['created_by'],
                                'referral_date': datetime.now()
                            }
                        },
                        upsert=True  # Create user record if it doesn't exist
                    )
                    
                    # Mark the invite as used
                    db.invites.update_one(
                        {'token': invite_token}, 
                        {
                            '$set': {
                                'used': True, 
                                'used_by': user_id,
                                'used_by_name': f"{session['first_name']} {session['last_name']}",
                                'used_at': datetime.now()
                            }
                        }
                    )
                    
                    # Increment a referral count for the inviter
                    db.users.update_one(
                        {'user_id': invite['created_by']}, 
                        {'$inc': {'referral_count': 1}}
                    )
                    
                    # Store a flash message to show on the profile page
                    flash("You've joined via an invitation. Welcome to our platform!", "success")
            except Exception as e:
                # Log the error but don't interrupt the user flow
                print(f"Error processing invite token: {e}")

        return redirect(url_for("profile"))

    except requests.exceptions.RequestException as e:
        return f"LinkedIn API Error: {e}", 500

def fetch_education_experience_details(profile_link):
    url = f"https://api.lix-it.com/v1/person?profile_link={profile_link}"

    payload={}
    headers = {
    'Authorization': lix_it_api
    }

    response = requests.request("GET", url, headers=headers, data=payload)
    education_details = []
    for i in range(len(response.json().get('education', []))):
        education_item = response.json()['education'][i]
        education_details.append({
            'InstitutionName': education_item.get('institutionName', ''),
            'Degree': education_item.get('degree', ''),
            'Field_of_study': education_item.get('fieldOfStudy', ''),
            'TimePeriod': education_item.get('timePeriod', '')
        })

    
    linkedin_data = response.json()
    experiences = linkedin_data.get('experience', [])
    
    # Create an empty list to store the experience dictionaries
    experience_details = []
    
    for exp in experiences:
        # Extract details
        org_name = exp.get('organisation', {}).get('name', ' ')
        location = exp.get('location', ' ')
        title = exp.get('title', ' ')
        
        # Extract time period
        time_period = exp.get('timePeriod', {})
        start_info = time_period.get('startedOn', {})
        end_info = time_period.get('endedOn', {})
        
        # Format start date
        if start_info:
            start_month = start_info.get('month', '')
            start_year = start_info.get('year', '')
            if start_month and start_year:
                start_date = f"{start_month}/{start_year}"
            elif start_year:
                start_date = str(start_year)
            else:
                start_date = ' '
        else:
            start_date = ' '
        
        # Format end date
        if not end_info:  # Empty dictionary
            end_date = 'Present'
        else:
            end_month = end_info.get('month', '')
            end_year = end_info.get('year', '')
            if end_month and end_year:
                end_date = f"{end_month}/{end_year}"
            elif end_year:
                end_date = str(end_year)
            else:
                end_date = ' '
        
        # Create a dictionary for this experience
        experience_dict = {
            'Title': title,
            'Organization': org_name,
            'Location': location,
            'StartDate': start_date,
            'EndDate': end_date
        }
        
        # Add the dictionary to our list
        experience_details.append(experience_dict)

    return education_details, experience_details

@app.route("/start_search")
def start_search():
    """
    Starts a new search for connections based on type and selected education or experience
    """
    search_type = request.args.get("type", "faculty")  # Default to faculty
    education_index = int(request.args.get("education_index", 0))  # Default to first education/experience
    user_id = session.get("user_id")
    user_role = session.get("role", "").lower()
    is_teacher = user_role in ["teacher", "professor", "principal"]

    print("Value of Is teacher is:", is_teacher)
    
    if not user_id:
        return jsonify({"success": False, "error": "Not logged in"})
    
    # Initialize task if needed
    if user_id not in background_tasks:
        background_tasks[user_id] = {}
    
    # Create a unique key for this search combination
    search_key = f"{search_type}_{education_index}"
    
    # Check if we're already running this search
    if search_key in background_tasks[user_id] and background_tasks[user_id][search_key].get("completed", False):
        # We already have results, return success immediately
        return jsonify({"success": True, "search_key": search_key})
    
    # Set up the background task
    background_tasks[user_id][search_key] = {
        "completed": False,
        "results": []
    }
    
    # Get search parameters based on user role
    if is_teacher:
        # For teachers, use experience details
        experience_details = session.get("experience_details", [])
        
        # Use the selected experience index for searching if it's valid
        if education_index < len(experience_details):
            selected_experience = experience_details[education_index]
            organization_name = selected_experience.get("Organization", "Unknown Organization")
            job_title = selected_experience.get("Title", "Employee")
            start_date = selected_experience.get("StartDate", "")
            end_date = selected_experience.get("EndDate", "Present")
            location = selected_experience.get("Location", "")
        else:
            # Fallback to first experience if index is invalid
            organization_name = experience_details[0].get("Organization", "Unknown Organization") if experience_details else "Unknown Organization"
            job_title = experience_details[0].get("Title", "Employee") if experience_details else "Employee"
            start_date = experience_details[0].get("StartDate", "") if experience_details else ""
            end_date = experience_details[0].get("EndDate", "Present") if experience_details else "Present"
            location = experience_details[0].get("Location", "") if experience_details else ""
        
        # Submit the task to the thread pool for experience-based search
        executor.submit(
            perform_connection_search,
            user_id, 
            organization_name,
            job_title, 
            search_key,
            start_date,
            end_date,
            location,
            is_teacher
        )
    else:
        # For students, use education details as before
        education_details = session.get("education_details", [])
        
        # Use the selected education index for searching if it's valid
        if education_index < len(education_details):
            selected_education = education_details[education_index]
            institute_name = selected_education.get("InstitutionName", "Unknown Institution")
            degree_or_roll = selected_education.get("Degree", "Student")
            start_date = selected_education.get("TimePeriod", {}).get("startedOn", {}).get("year", "")
            end_date = selected_education.get("TimePeriod", {}).get("endedOn", {}).get("year", "")
        else:
            # Fallback to first education if index is invalid
            institute_name = education_details[0].get("InstitutionName", "Unknown Institution") if education_details else "Unknown Institution"
            degree_or_roll = education_details[0].get("Degree", "Student") if education_details else "Student"
            start_date = education_details[0].get("TimePeriod", {}).get("startedOn", {}).get("year", "") if education_details else ""
            end_date = education_details[0].get("TimePeriod", {}).get("endedOn", {}).get("year", "") if education_details else ""
        
        # Submit the task to the thread pool for education-based search
        executor.submit(
            perform_connection_search,
            user_id, 
            institute_name, 
            degree_or_roll, 
            search_key,
            start_date,
            end_date,
            "",  # No location for education-based search
            is_teacher
        )
    
    return jsonify({"success": True, "search_key": search_key})

@app.route("/check_search_status")
def check_search_status():
    """
    API endpoint to check if a search is complete
    """
    search_type = request.args.get("type", "faculty")
    education_index = request.args.get("education_index", 0)
    user_id = session.get("user_id")
    
    # Create the same search key used in start_search
    search_key = f"{search_type}_{education_index}"
    
    if not user_id or user_id not in background_tasks:
        return jsonify({"completed": False, "error": "No search in progress"})
    
    if search_key not in background_tasks[user_id]:
        return jsonify({"completed": False, "error": "Search type not found"})
    
    task = background_tasks[user_id][search_key]
    
    if task["completed"]:
        results = task["results"]
        
        # Check which profiles are already saved by this user
        if results:
            user_email = session.get("email")
            for profile in results:
                # Add a flag indicating if this profile is already saved
                saved_profile = saved_profiles_collection.find_one({
                    "link": profile["link"],
                    "saved_by": user_email
                })
                profile["is_saved"] = bool(saved_profile)
        
        return jsonify({
            "completed": True,
            "results": results
        })
    
    return jsonify({"completed": False})

@app.route("/save_profile", methods=["POST"])
def save_profile():
    """
    API endpoint to save a profile to MongoDB
    """
    if "email" not in session:
        return jsonify({"success": False, "error": "Not logged in"})
    
    data = request.json
    profile_name = data.get("name")
    profile_link = data.get("link")
    profile_type = data.get("type", "faculty")
    institute = data.get("institute", "Unknown Institution")
    remark = data.get('remark', 'None')
    saved_by_role = session.get('role', '').lower()
    
    if not profile_name or not profile_link:
        return jsonify({"success": False, "error": "Missing profile data"})
    
    # Check if already saved
    existing_profile = saved_profiles_collection.find_one({
        "link": profile_link,
        "saved_by": session["email"]
    })
    
    if existing_profile:
        return jsonify({"success": False, "error": "Profile already saved"})
    
    # Save to MongoDB
    profile_data = {
        "name": profile_name,
        "link": profile_link,
        "profile_type": profile_type,
        "institute": institute,
        "saved_by": session["email"],
        "saved_at": datetime.now(),
        "user_first_name": session.get("first_name"),
        "user_last_name": session.get("last_name"),
        'remark': remark,
        'saved_by_role': saved_by_role
    }
    
    try:
        result = saved_profiles_collection.insert_one(profile_data)
        return jsonify({
            "success": True, 
            "message": "Profile saved successfully",
            "profile_id": str(result.inserted_id)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/remove_profile", methods=["POST"])
def remove_profile():
    """
    API endpoint to remove a saved profile
    """
    if "email" not in session:
        return jsonify({"success": False, "error": "Not logged in"})
    
    data = request.json
    profile_link = data.get("link")
    
    if not profile_link:
        return jsonify({"success": False, "error": "Missing profile link"})
    
    try:
        result = saved_profiles_collection.delete_one({
            "link": profile_link,
            "saved_by": session["email"]
        })
        
        if result.deleted_count > 0:
            return jsonify({"success": True, "message": "Profile removed successfully"})
        else:
            return jsonify({"success": False, "error": "Profile not found"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/saved_profiles")
def saved_profiles():
    """
    Display saved profiles for the current user
    """

    user_role = session.get('role', '').lower()

    if "email" not in session:
        flash("Please log in first.", "warning")
        return redirect(url_for("home"))
    
    try:
        profiles = list(saved_profiles_collection.find({"saved_by": session["email"],
                                                        'saved_by_role': user_role}))
        # Convert ObjectId to string for JSON serialization
        for profile in profiles:
            profile["_id"] = str(profile["_id"])
        
        return render_template("saved_profiles.html", 
                              profiles=profiles, 
                              session=session)
    except Exception as e:
        flash(f"Error loading saved profiles: {e}", "danger")
        return redirect(url_for("profile"))

def connection_search(query, search_type="students"):
    """
    Search for connections using Google Custom Search API instead of googlesearch package
    Limit results to 5 for faculty searches, 10 for other searches
    """
    results = []
    # Extract the actual search type from the combined key if necessary
    if "_" in search_type:
        search_type = search_type.split("_")[0]
    
    # Set num based on search type
    num_results = 5 if search_type == "faculty" else 10
    
    for i in range(1, 100, 10):
        params = {
            "q": query,
            "cx": CSE_ID,
            "key": GOOGLE_API_KEY,
            "num": num_results,  # Number of results adjusted based on type
            "start": i
        }
        
        try:
            response = requests.get(GOOGLE_SEARCH_URL, params=params)
            response.raise_for_status()
            search_results = response.json()
            # print(search_results)
            
            if "items" in search_results:
                for item in search_results["items"]:
                    if "linkedin.com/in/" in item["link"]:
                        results.append(item["link"])
        except Exception as e:
            print(f"Error in connection search: {e}")
    
    return results

# For backward compatibility - alias the old function to new one
def alumni_search(institute_name, degree):
    query = f'site:linkedin.com/in "{institute_name}" "{degree}"'
    return connection_search(query, "students")
    
def search_linkedin_profile_advanced(first_name, last_name, College, job_title=""):
    search_query = f"{first_name} {last_name} {College} {job_title} site:linkedin.com/in"
    params = {"q": search_query, "cx": CSE_ID, "key": GOOGLE_API_KEY, "num" :1}

    try:
        response = requests.get(GOOGLE_SEARCH_URL, params=params)
        response.raise_for_status()
        search_results = response.json()

        if "items" in search_results and len(search_results["items"]) > 0:
            linkedin_urls = [item["link"] for item in search_results["items"]]

            # print("Linedin urls are:", linkedin_urls)

            # Prioritize exact match with names in URL
            lower_first = first_name.lower()
            lower_last = last_name.lower()
            for url in linkedin_urls:
                if lower_first in url.lower() and lower_last in url.lower():
                    # print(url)
                    return url

            # Return first available LinkedIn link if no perfect match
            return linkedin_urls[0] if linkedin_urls else "Profile not found"

        else:
            return "Profile not found"

    except Exception as e:
        return f"Error fetching profile: {e}"

def download_image(image_url, save_path="static/profile_picture.jpg"):
    """
    Downloads an image from the given URL and saves it.
    """
    response = requests.get(image_url, stream=True)
    if response.status_code == 200:
        with open(save_path, "wb") as file:
            for chunk in response.iter_content(1024):
                file.write(chunk)
        # print(f"Image downloaded successfully: {save_path}")
    else:
        # print("Failed to download image")
        pass

@app.route("/invitation_coming_soon")
def invitation_coming_soon():
    """
    Placeholder page for the invitation feature that's coming soon
    """
    if "email" not in session:
        flash("Please log in first.", "warning")
        return redirect(url_for("home"))
    
    # Check if user has appropriate role
    user_role = session.get("role", "").lower()
    if user_role not in ["teacher", "professor", "principal"]:
        flash("You don't have permission to access this feature.", "warning")
        return redirect(url_for("saved_profiles"))
    
    return render_template("invitation_coming_soon.html", session=session)

@app.route("/profile")
def profile():
    """
    Displays the user profile.
    """
    if "first_name" not in session:
        flash("Please log in first.", "warning")
        return redirect(url_for("home"))
    
    return render_template("profile.html", session=session)



@app.route("/logout", methods=["GET", "POST"])
def logout():
    """
    Logs out the user and clears the session.
    """
    # Clean up any background tasks
    user_id = session.get("user_id")
    if user_id and user_id in background_tasks:
        del background_tasks[user_id]
    
    # Set flag to indicate user explicitly logged out
    session["logged_out"] = True
    
    # Clear the session but keep the logout flag
    for key in list(session.keys()):
        if key != "logged_out":
            session.pop(key)
    
    # Redirect to logout page
    return redirect(url_for("logout_complete"))

from pprint import pprint

@app.route('/send_profiles_list', methods=['POST'])
def send_profiles_list():
    try:
        data = request.json
        recipient_email = data.get('email')
        subject = data.get('subject')
        message = data.get('message')
        profiles = data.get('profiles')

        # Validate the data
        if not recipient_email or not subject or not profiles:
            return jsonify({"success": False, "error": "Missing required fields"})
        
        # Get current user information
        user_role = session.get('role', '')
        first_name = session.get('first_name', '')
        last_name = session.get("last_name", "")
        user_name = first_name + " " + last_name
        user_email = session.get('email', '')
        
        # Determine user type for the heading
        user_type = 'Student' if 'teacher' in user_role.lower() or 'professor' in user_role.lower() or 'principal' in user_role.lower() else 'Faculty'
        
        # Build the profiles as plain text
        profiles_text = ""
        for i, profile in enumerate(profiles, 1):
            profiles_text += f"{i}. {profile['name']} - {profile['institute']} - {profile['Link']}\n"
        
        # Create a simple text email
        plain_text = f"""
Alumni Connect - {user_type} Profiles Shared

Hello,

{user_name} ({user_email}) has shared the following profiles with you via Alumni Connect:

{message if message else ""}

Profiles:
{profiles_text}

For more information, please log in to your Alumni Connect account.

Best regards,
Alumni Connect Team
        """
        
        # Send email (using plain text instead of HTML)
        send_email(recipient_email, subject, plain_text)
        
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# Helper function for sending emails
from email.message import EmailMessage
import ssl
import smtplib


def send_email(to, subject, html_content):
    try:
        email_sender = "mjadon624@gmail.com"
        email_password = "rmgu lqxn lskm sjhn"
        email_reciever = to


        # subject = "Check out my new mail"

        body = html_content

        em = EmailMessage()

        em["From"] = email_sender
        em["To"] = email_reciever
        em["Subject"] = subject

        em.set_content(body)

        context = ssl.create_default_context()

        with smtplib.SMTP_SSL('smtp.gmail.com', 465, context= context) as smtp:
            smtp.login(email_sender, email_password)

            smtp.sendmail("yugalsingh892@gmail.com",email_reciever,em.as_string())        
        
        # print(f"Email sent with status code: {response.status_code}")
        return True
    except Exception as e:
        print(f"Email sending failed: {str(e)}")
        return False
    


@app.route("/logout_complete")
def logout_complete():
    """
    Dedicated logout page to ensure the OAuth flow is broken
    """
    # Make sure session is empty
    session.clear()
    
    flash("You have been logged out successfully.", "info")
    
    # Generate a new anti-CSRF token for the login page
    token = os.urandom(24).hex()
    session['logout_token'] = token
    
    # Pass the token to the template
    return render_template("logout.html", token=token)


@app.route('/generate_invite_link', methods=['POST'])
def generate_invite_link():
    try:
        # Get current user info from session
        user_id = session.get("user_id")
        user_name = f"{session.get('first_name', '')} {session.get('last_name', '')}"
        
        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'})
        
        # Generate a unique token
        invite_token = str(uuid.uuid4())[:8]  # Using first 8 chars for shorter URL
        
        # Store the invite in your database
        db.invites.insert_one({
            'token': invite_token,
            'created_by': user_id,
            'created_by_name': user_name,
            'created_at': datetime.now(),
            'used': False
        })
        
        # Create the full invite URL
        invite_link = f"{BASE_URL}/?invite={invite_token}"
        
        return jsonify({
            'success': True,
            'inviteLink': invite_link
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# Clean up executor when app exits
@atexit.register
def shutdown_executor():
    executor.shutdown(wait=False)

if __name__ == "__main__":
    app.run(debug=True)