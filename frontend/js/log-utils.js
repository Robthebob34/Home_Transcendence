function isValidJSON(str) {
    try {
        JSON.parse(str);
        return true;
    } catch (e) {
        return false;
    }
}

function showError(message) {
    if(isValidJSON(message)){
        let jsonObject = JSON.parse(message);
        message = jsonObject.detail;
    }
	const errorMessage = document.getElementById(getPage()+'_errorMessage');
	errorMessage.textContent = message;
	errorMessage.style.display = 'block';
	console.error('Error:', message);
}

async function attemptLogin(username, password, csrfToken) {
    console.log('Attempting login...');
    const loginResponse = await fetch('/api/users/login/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
    });

    if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        console.error('Login Error:', loginResponse.status, errorText);
        throw new Error(errorText);
    }
    
    if (await loadLoginInfos() == true){
        console.log('Login successful');
        getid();
        return true;
    }
}


function handleRedirect(url) {
    console.log('Redirecting to:', url);
    window.location.href = url;
}

function isAuthenticated(){
    checkAuth().then(isAuthenticated => {
        console.log("a>"+isAuthenticated)
		if(isAuthenticated == true){
        	return 1;
		}
        return 0;
	});
    return 0;
}

function isRegexUsername(value, showErr) {
    var regex = /^[a-zA-Z0-9_]+$/;

    if (regex.test(value)) {
        return 1;
    } else {
        if(showErr == 1)
            showError(getTranslation("global_regexusername"));
        else
            showNotification(getTranslation("global_regexusername"), "error");
        return 0;
    }
}

function isRegexEmail(value, showErr) {
    var regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (regex.test(value)) {
        return 1;
    } else {
        if(showErr == 1)
            showError(getTranslation("global_regexemail"));
        else
            showNotification(getTranslation("global_regexemail"), "error");
        return 0;
    }
}

function isRegexPassword(value, showErr) {
    var regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/;

    if (regex.test(value)) {
        return 1;
    } else {
        if(showErr == 1)
            showError(getTranslation("global_regexpassw"));
        else
            showNotification(getTranslation("global_regexpassw"), "error");
        return 0;
    }
}