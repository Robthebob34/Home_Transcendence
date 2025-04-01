async function loadFriends(){
	console.log("Loading friends.")
	fetchPendingUsers();
	fetchFriends();
	fetchBlockedUsers();
	fetchWaitingUsers();
}


function initFriends(){
	console.log("Initializing friends page.")
}


async function addFriend() {
	const friendInput = document.getElementById('friendInput').value;
    if(isRegexUsername(friendInput) == 0)
        return;
	if (!friendInput) return showNotification(getTranslation("friends_enterusername"), "error");
	const response = await fetch('/api/chat/add_friend_username/', {
		method: 'POST',
		headers: {'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken')},
		body: JSON.stringify({id_user_1: friendInput})
	});
    if(response.ok) {
        showNotification(getTranslation("friends_asked"));
        loadFriends();
    } else {
        const data = await response.json();
        console.warn(data.message);
        if(data.message.includes("already")){
            showNotification(friendInput + getTranslation("friends_already_friend"), "error");
        } else showNotification(getTranslation("friends_notfound"), "error");
    }
}


async function fetchFriends() {
    console.log("Loading friend list.");
    await fetch("/api/chat/get_friends/", {
        method: "GET",
        credentials: "include"
    })
    .then(response => response.json())
    .then(data => {
        console.log("Response data:", data);
        let friendsUl = document.getElementById("friendsList");
        friendsUl.innerHTML = "";
        if (data.mutual_friends && data.mutual_friends.length > 0) {

            data.mutual_friends.forEach(friend => {
                let li = document.createElement("li");
                li.classList.add("friends_ul");

                let usernameSpan = document.createElement("span");
                usernameSpan.classList.add("friends_username");
                usernameSpan.textContent = friend.username;
                
                let li1 = document.createElement("li");
                let li2 = document.createElement("li");
                let li1text = document.createElement("span");
                let li2text = document.createElement("span");
                li1text.classList.add("friends_litext");
                li2text.classList.add("friends_litext");
                li1text.textContent = "Visit profile";
                li2text.textContent = "Remove friend";
                li1.classList.add("friends_ul", "visit");
                li2.classList.add("friends_ul", "remove");
                li1.appendChild(li1text);
                li2.appendChild(li2text);

                li.appendChild(li1);
                li.appendChild(usernameSpan);
                li.appendChild(li2);
                function hover(){
                    li.classList.add("special");
                    usernameSpan.style.opacity = "0";
                }

                function unhover(){
                    li.classList.remove("special");
                    usernameSpan.style.opacity = "1";
                }

                li.dataset.friendId = friend.id;
                friendsUl.appendChild(li);

                li1.addEventListener("click", function () {
                    window.location.href = `#profile?id=${friend.id}`;
                });

                li2.addEventListener("click", async function () {
                    try {
                        console.log("Managing friendship with "+ friend.id);
            
                        const response = await fetch('/api/chat/delete_friend_user/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                            body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: friend.id })
                        });
                        const data = await response.json();
                        showNotification(getTranslation("profile_friend_removed")+friend.username, "success");
                        friendsUl.removeChild(li);
                        loadFriends();
                    } catch (error) {
                        console.error('Error logging out:', error);
                    }
                });

                li.addEventListener("mouseenter", () => {
                    hover();
                });

                li.addEventListener("mouseleave", () => {
                    unhover();
                });
            });
        } else {
            if (!friendsUl.querySelector(".friends_list_empty")) {
                let noBlockedUl = document.createElement("ul");
                noBlockedUl.classList.add("friends_list_empty");
                noBlockedUl.classList.add("active");
                noBlockedUl.id = "friends_list_empty";
    
                let noBlockedP = document.createElement("p");
                noBlockedP.id = "friends_list_empty";
                noBlockedP.textContent = getTranslation("friends_not_friends");
                
                noBlockedUl.appendChild(noBlockedP);
                friendsUl.appendChild(noBlockedUl);   
            }
        }
    })
    .catch(error => console.error("Error while getting friend list :", error));
}

async function fetchPendingUsers() {
    console.log("Loading pending users list.");
    await fetch("/api/chat/get_pending_friends/", {
        method: "GET",
        credentials: "include"
    })
    .then(response => response.json())
    .then(data => {
        console.log("Response data:", data);
        let pendingUsersUl = document.getElementById("pendingList");
        pendingUsersUl.innerHTML = "";
        if (data.pending && data.pending.length > 0) {

            data.pending.forEach(pendingUser => {
                let li = document.createElement("li");
                li.classList.add("friends_ul", "pending");

                let usernameSpan = document.createElement("span");
                usernameSpan.classList.add("friends_username");
                usernameSpan.textContent = pendingUser.username;

                li.appendChild(usernameSpan);
                function hover(){
                    setTimeout(() => {
                        usernameSpan.textContent = "Cancel request";
                    }, 100);
                }

                function unhover(){
                    setTimeout(() => {
                        usernameSpan.textContent = pendingUser.username;
                    }, 100);
                }

                li.dataset.pendingUserId = pendingUser.id;
                pendingUsersUl.appendChild(li);

                li.addEventListener("click", async function () {
                    try {
                        console.log("Managing friendship with "+ pendingUser.id);
            
                        const response = await fetch('/api/chat/delete_friend_user/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                            body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: pendingUser.id })
                        });
                        const data = await response.json();
                        showNotification(getTranslation("profile_friend_cancelled"), "success");
                        pendingUsersUl.removeChild(li);
                        loadFriends();
                    } catch (error) {
                        console.error('Error logging out:', error);
                    }
                });

                li.addEventListener("mouseenter", () => {
                    hover();
                });

                li.addEventListener("mouseleave", () => {
                    unhover();
                });
            });
        } else {
            if (!pendingUsersUl.querySelector(".friends_list_empty")) {
                let noBlockedUl = document.createElement("ul");
                noBlockedUl.classList.add("friends_list_empty");
                noBlockedUl.classList.add("active");
                noBlockedUl.id = "friends_list_empty";

                let noBlockedP = document.createElement("p");
                noBlockedP.id = "friends_list_empty";
                noBlockedP.textContent = getTranslation("friends_not_pending");
                
                noBlockedUl.appendChild(noBlockedP);
                pendingUsersUl.appendChild(noBlockedUl);
            }
        }
    })
    .catch(error => console.error("Error while getting pending users list:", error));
}

async function fetchWaitingUsers() {
    console.log("Loading waiting users list.");
    await fetch("/api/chat/get_waiting_friends/", {
        method: "GET",
        credentials: "include"
    })
    .then(response => response.json())
    .then(data => {
        console.log("Response data:", data);
        let waitingUsersUl = document.getElementById("waitingList");
        waitingUsersUl.innerHTML = "";
        if (data.waiting && data.waiting.length > 0) {

            data.waiting.forEach(waitingUser => {
                let li = document.createElement("li");
                li.classList.add("friends_ul");

                let usernameSpan = document.createElement("span");
                usernameSpan.classList.add("friends_username");
                usernameSpan.textContent = waitingUser.username;
                
                let li1 = document.createElement("li");
                let li2 = document.createElement("li");
                let li1text = document.createElement("span");
                let li2text = document.createElement("span");
                li1text.classList.add("friends_litext");
                li2text.classList.add("friends_litext");
                li1text.textContent = "Accept request";
                li2text.textContent = "Deny request";
                li1.classList.add("friends_ul", "visit");
                li2.classList.add("friends_ul", "remove");
                li1.appendChild(li1text);
                li2.appendChild(li2text);

                li.appendChild(li1);
                li.appendChild(usernameSpan);
                li.appendChild(li2);
                function hover(){
                    li.classList.add("special");
                    usernameSpan.style.opacity = "0";
                }

                function unhover(){
                    li.classList.remove("special");
                    usernameSpan.style.opacity = "1";
                }

                li.dataset.waitingUserId = waitingUser.id;
                waitingUsersUl.appendChild(li);

                li1.addEventListener("click", async function () {
                    try {
                        console.log("Managing friendship with "+ waitingUser.id);
            
                        const response = await fetch('/api/chat/add_friend_user/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                            body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: waitingUser.id })
                        });
                        const data = await response.json();
                        showNotification(getTranslation("profile_friend_accepted"), "success");
                        waitingUsersUl.removeChild(li);
                        loadFriends();
                    } catch (error) {
                        console.error('Error logging out:', error);
                    }
                });

                li2.addEventListener("click", async function () {
                    try {
                        console.log("Managing friendship with "+ waitingUser.id);
            
                        const response = await fetch('/api/chat/delete_friend_user/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                            body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: waitingUser.id })
                        });
                        const data = await response.json();
                        showNotification(getTranslation("profile_friend_refused"), "success");
                        waitingUsersUl.removeChild(li);
                        loadFriends();
                    } catch (error) {
                        console.error('Error logging out:', error);
                    }
                });

                li.addEventListener("mouseenter", () => {
                    hover();
                });

                li.addEventListener("mouseleave", () => {
                    unhover();
                });
            });
        } else {
            if (!waitingUsersUl.querySelector(".friends_list_empty")) {
                let noBlockedUl = document.createElement("ul");
                noBlockedUl.classList.add("friends_list_empty");
                noBlockedUl.classList.add("active");
                noBlockedUl.id = "friends_list_empty";

                let noBlockedP = document.createElement("p");
                noBlockedP.id = "friends_list_empty";
                noBlockedP.textContent = getTranslation("friends_not_waiting");
                
                noBlockedUl.appendChild(noBlockedP);
                waitingUsersUl.appendChild(noBlockedUl);
            }
        }
    })
    .catch(error => console.error("Error while getting waiting users list:", error));
}

async function fetchBlockedUsers() {
    console.log("Loading blocked users list.");
    await fetch("/api/chat/get_blocked/", {
        method: "GET",
        credentials: "include"
    })
    .then(response => response.json())
    .then(data => {
        console.log("Response data:", data);
        if (data.blocked && data.blocked.length > 0) {
            let blockedUsersUl = document.getElementById("blockedList");
            blockedUsersUl.innerHTML = "";

            data.blocked.forEach(blockedUser => {
                let li = document.createElement("li");
                li.textContent = blockedUser.username;
                li.classList.add("blocked-user-item");
                li.dataset.blockedUserId = blockedUser.id;
                blockedUsersUl.appendChild(li);

                li.addEventListener("click", function () {
                    window.location.href = `#profile?id=${blockedUser.id}`;
                });
            });
        } else {
            console.warn("No blocked users found.");
        }
    })
    .catch(error => console.error("Error while getting blocked users list:", error));
}


async function searchUsers(){
	const searchInput = document.getElementById('friends_search').value.trim();
	const searchResults = document.getElementById('friends_search_results');
	
	if(searchInput.length < 3){
		searchResults.innerHTML = '<p class="friends_search-error">Please enter at least 3 characters</p>';
		return;
	}
	
	try {
		const response = await fetch('/api/chat/add_friend_username/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
			body: JSON.stringify({ id_user_1: searchInput })
		});
		const data = await response.json();
		
		searchResults.innerHTML = '';
		
		if(data.users && data.users.length > 0) {
			data.users.forEach(user => {
				// Don't display current user in search results
				if(user.id === getCookie('id')) return;
				
				const userElement = document.createElement('div');
				userElement.className = 'friends_search-item';
				userElement.innerHTML = `
					<div class="friends-item-info">
						<img src="/images/logo.jpg" alt="User Avatar" class="friends_avatar">
						<span class="friends_username">${user.username}</span>
					</div>
					<div class="friends-item-actions">
						<button class="friends_add-btn" onclick="manageFriendship('${user.id}', 'add_friend_user')">Add Friend</button>
						<button class="friends_profile-btn" onclick="viewProfile('${user.id}')">View Profile</button>
					</div>
				`;
				searchResults.appendChild(userElement);
			});
		} else {
			searchResults.innerHTML = '<p class="friends_no-items">No users found</p>';
		}
	} catch (error) {
		console.error('Error searching users:', error);
		searchResults.innerHTML = '<p class="friends_search-error">Error searching users</p>';
	}
}

async function manageFriendship(userId, action){
	try {
		const response = await fetch(`/api/chat/${action}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
			body: JSON.stringify({ id_user_0: getCookie('id'), id_user_1: userId })
		});
		const data = await response.json();
		console.log(`Friend action (${action}) response:`, data);
		
		// Reload friends list after action
		loadFriends();
		
		// If search was performed, refresh search results
		if(document.getElementById('friends_search').value.trim().length >= 3) {
			searchUsers();
		}
	} catch (error) {
		console.error(`Error in friend action (${action}):`, error);
	}
}

function viewProfile(userId) {
	window.location.href = `#profile?id=${userId}`;
}

function openChat(userId) {
	window.location.href = `#chat?id=${userId}`;
}