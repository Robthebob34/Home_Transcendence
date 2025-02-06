// Authentication handling

document.addEventListener('DOMContentLoaded', () => {
    console.log('Setting up authentication handlers...');
    setupAuthHandlers();
    checkAuthStatus();
});

function setupAuthHandlers() {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    
    if (loginBtn) {
        console.log('Setting up login button handler...');
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/login';
        });
    }
    
    if (registerBtn) {
        console.log('Setting up register button handler...');
        registerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // TODO: Implement registration page
            alert('Registration coming soon!');
        });
    }
}

async function getCSRFToken() {
    try {
        const response = await fetch('/api/users/csrf/', {
            method: 'GET',
            credentials: 'include',
        });
        if (response.ok) {
            const data = await response.json();
            return data.csrfToken;
        }
        console.error('Failed to get CSRF token');
        return null;
    } catch (error) {
        console.error('Error getting CSRF token:', error);
        return null;
    }
}

async function submitLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    try {
        const csrfToken = await getCSRFToken();
        if (!csrfToken) {
            showError('Failed to get CSRF token');
            return;
        }

        const response = await fetch('/api/users/login/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('user', JSON.stringify(data));
            window.location.href = '/game';
        } else {
            const error = await response.json();
            showError(error.detail || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('An error occurred during login');
    }
}

function updateUIForAuthenticatedUser(user) {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const userInfo = document.getElementById('userInfo');
    
    if (loginBtn) loginBtn.style.display = 'none';
    if (registerBtn) registerBtn.style.display = 'none';
    
    if (userInfo) {
        userInfo.innerHTML = `
            <span>Welcome, ${user.username}!</span>
            <button onclick="handleLogout()">Logout</button>
        `;
    }
}

async function handleLogout() {
    try {
        const csrfToken = await getCSRFToken();
        if (!csrfToken) {
            console.error('Failed to get CSRF token for logout');
            return;
        }

        const response = await fetch('/api/users/logout/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken
            },
            credentials: 'include'
        });

        if (response.ok) {
            localStorage.removeItem('user');
            window.location.href = '/login';
        } else {
            console.error('Logout failed');
        }
    } catch (error) {
        console.error('Error during logout:', error);
    }
}

async function checkAuthStatus() {
    console.log('Checking authentication status...');
    
    // Check if we're on the login page
    const isLoginPage = window.location.pathname === '/login';
    
    try {
        const response = await fetch('/api/users/profile/', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const user = await response.json();
            localStorage.setItem('user', JSON.stringify(user));
            
            // If authenticated and on login page, redirect to game
            if (isLoginPage) {
                window.location.href = '/game';
                return;
            }
            
            updateUIForAuthenticatedUser(user);
        } else {
            localStorage.removeItem('user');
            
            // If not authenticated and not on login page, redirect to login
            if (!isLoginPage) {
                window.location.href = '/login';
            }
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        if (!isLoginPage) {
            window.location.href = '/login';
        }
    }
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
