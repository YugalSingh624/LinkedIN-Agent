from flask import Flask, render_template, redirect, request, session, url_for, flash, jsonify
import requests
import os
import re
import pymongo
from bson.objectid import ObjectId
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import atexit
from dotenv import load_dotenv


load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("secret_key")  # Change this in production

#lix_it_api

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
    
    linkedin_auth_url = (
        f"{AUTH_URL}?response_type=code&client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}&scope=openid%20profile%20email"
    )
    return render_template("index.html", linkedin_auth_url=linkedin_auth_url)

@app.route("/handle_login", methods=["POST"])
def handle_login():
    """
    Handles form-based login from index.html.
    """
    education = request.form.get("name")
    add_info = request.form.get("email")
    role = request.form.get("role")  # Get the user's role

    if not education or not add_info or not role:
        flash("Please enter all required information.", "danger")
        return redirect(url_for("home"))

    # Store in session
    session["education"] = education
    session["add_info"] = add_info
    session["role"] = role  # Store the role in the session

    print(session["education"])
    print(session["add_info"])
    print(session["role"])  # Log the role

    flash("Login successful!", "success")
    return redirect(
        f"{AUTH_URL}?response_type=code&client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}&scope=openid%20profile%20email"
    )

def perform_connection_search(user_id, institute_name, degree_or_roll, search_type, start_date, end_date):
    """
    Background task to perform connection search based on type

    """
    print("Searched for:", search_type)

    try:
        # If we have multiple education entries, use the first one for search
        if isinstance(institute_name, list):
            institute_name = institute_name[0]
            
        if "faculty" in search_type:
            query = f'site:linkedin.com/in "{institute_name}" "professor" '
        else:  # students
            query = f'site:linkedin.com/in "{institute_name}" "{degree_or_roll}" "{start_date}" '

        print("Query used is:", query)
        
        # Pass the search_type to connection_search
        urls = connection_search(query, search_type)
        print("These are urls: ", urls)
        
        results = []
        for url in urls:
            name = extract_name_from_url(url)
            results.append({
                "name": name,
                "link": url,
                "profile_type": search_type,
                "institute": institute_name
            })
        
        # Store the results in the background_tasks dictionary
        background_tasks[user_id][search_type] = {
            "completed": True,
            "results": results
        }
    except Exception as e:
        print(f"Error in search thread: {e}")
        # Make sure we mark as completed even on error
        background_tasks[user_id][search_type] = {
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
        
        # For LinkedIn URL search, use the first institution if multiple are present
        session["linkedin_url"] = search_linkedin_profile_advanced(
            session["first_name"], 
            session["last_name"],
            session["education"],
            session["add_info"]
        )
        # Directly assign the education details from the provided JSON
        education_details = fetch_education_details(session["linkedin_url"])
        # This now accepts a list of education entries
        # education_details = [
        #     {'Degree': "Bachelor's degree", 'Field_of_study': 'Human, Social & Political Sciences', 
        #      'InstitutionName': 'University of Cambridge', 
        #      'TimePeriod': {'endedOn': {'year': 2016}, 'startedOn': {'year': 2013}}},
        #     {'Degree': 'Access Diploma', 'Field_of_study': 'Mixed Media', 
        #      'InstitutionName': 'City and Islington College', 
        #      'TimePeriod': {'endedOn': {'year': 2013}, 'startedOn': {'year': 2012}}},
        # ]
        session["education_details"] = education_details
        


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

        return redirect(url_for("profile"))

    except requests.exceptions.RequestException as e:
        return f"LinkedIn API Error: {e}", 500

def fetch_education_details(profile_link):
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

    return education_details

@app.route("/start_search")
def start_search():
    """
    Starts a new search for connections based on type and selected education
    """
    search_type = request.args.get("type", "faculty")  # Default to faculty
    education_index = int(request.args.get("education_index", 0))  # Default to first education
    user_id = session.get("user_id")
    
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
    
    # Get search parameters
    education_details = session.get("education_details", [])
    
    # Use the selected education index for searching if it's valid
    if education_index < len(education_details):
        selected_education = education_details[education_index]
        institute_name = selected_education.get("InstitutionName", "Unknown Institution")
        degree_or_roll = selected_education.get("Degree", "Student")
        start_date = selected_education.get("TimePeriod", "").get("startedOn", "").get("year", "")
        end_date = selected_education.get("TimePeriod", "").get("endedOn", "").get("year", "")
    else:
        # Fallback to first education if index is invalid
        institute_name = education_details[0].get("InstitutionName", "Unknown Institution") if education_details else "Unknown Institution"
        degree_or_roll = education_details[0].get("Degree", "Student") if education_details else "Student"
    
    # Submit the task to the thread pool
    executor.submit(
        perform_connection_search,
        user_id, 
        institute_name, 
        degree_or_roll, 
        search_key , # Use the combined key so we can store different searches
        start_date,
        end_date
        
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
        "user_last_name": session.get("last_name")
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
    if "email" not in session:
        flash("Please log in first.", "warning")
        return redirect(url_for("home"))
    
    try:
        profiles = list(saved_profiles_collection.find({"saved_by": session["email"]}))
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
    params = {"q": search_query, "cx": CSE_ID, "key": GOOGLE_API_KEY}

    try:
        response = requests.get(GOOGLE_SEARCH_URL, params=params)
        response.raise_for_status()
        search_results = response.json()

        if "items" in search_results and len(search_results["items"]) > 0:
            linkedin_urls = [item["link"] for item in search_results["items"]]

            # Prioritize exact match with names in URL
            lower_first = first_name.lower()
            lower_last = last_name.lower()
            for url in linkedin_urls:
                if lower_first in url.lower() and lower_last in url.lower():
                    print(url)
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
        print(f"Image downloaded successfully: {save_path}")
    else:
        print("Failed to download image")

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

# Clean up executor when app exits
@atexit.register
def shutdown_executor():
    executor.shutdown(wait=False)

if __name__ == "__main__":
    app.run(debug=True)