// ВАШИ УЧЕТНЫЕ ДАННЫЕ FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDIEydSnMe0r2xvqTo63N9DN676_DsNn0o",
  authDomain: "ttfotgassessmentenhanced.firebaseapp.com",
  projectId: "ttfotgassessmentenhanced",
  databaseURL: "https://ttfotgassessmentenhanced-default-rtdb.firebaseio.com",
  storageBucket: "ttfotgassessmentenhanced.appspot.com",
  messagingSenderId: "1017801402503",
  appId: "1:1017801402503:web:67e54f87ceec9760fff022"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
// Firebase Storage больше не используется

let currentUser = null, userProfile = {}, currentQuarter = 1, currentSubject = "Английский язык", currentTabId = "section", allGradesData = {}, saveDataTimeout;
let currentLeaderboardSort = 'percentage';

document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app-container');
    const authOverlay = document.getElementById('auth-overlay');
    const userDisplayNameElement = document.getElementById('user-display-name');
    const profilePictureContainer = document.getElementById('profile-picture-container');
    const profilePictureInput = document.getElementById('profile-picture-input');
    const postsContainer = document.getElementById('posts-container');
    
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            authOverlay.classList.add('hidden');
            appContainer.classList.remove('hidden');
            loadUserData().then(() => { handleUrlParams(); });
        } else {
            currentUser = null;
            if(userDisplayNameElement) userDisplayNameElement.textContent = '';
            authOverlay.classList.remove('hidden');
            appContainer.classList.add('hidden');
        }
    });

    document.getElementById('login-button').addEventListener('click', () => {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        document.getElementById('login-error').textContent = '';
        auth.signInWithEmailAndPassword(email, password).catch(error => {
            document.getElementById('login-error').textContent = getFriendlyAuthError(error.code);
        });
    });

    document.getElementById('register-button').addEventListener('click', () => {
        const username = document.getElementById('register-username').value.trim();
        const userClass = document.getElementById('register-class').value.trim();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const errorElement = document.getElementById('register-error');
        errorElement.textContent = '';
        if (username.length < 3 || username.length > 15 || !/^[a-zA-Z0-9]+$/.test(username)) {
            errorElement.textContent = 'Имя: 3-15 латинских букв и цифр.'; return;
        }
        if (!userClass) {
            errorElement.textContent = 'Пожалуйста, укажите ваш класс.'; return;
        }
        const usernameRef = db.ref(`usernames/${username.toLowerCase()}`);
        usernameRef.once('value').then(snapshot => {
            if (snapshot.exists()) {
                errorElement.textContent = 'Это имя пользователя уже занято.';
            } else {
                auth.createUserWithEmailAndPassword(email, password).then(userCredential => {
                    const user = userCredential.user;
                    db.ref(`users/${user.uid}/profile`).set({ username: username, email: user.email, class: userClass, isPublic: true });
                    usernameRef.set(user.uid);
                }).catch(error => {
                    errorElement.textContent = getFriendlyAuthError(error.code);
                });
            }
        });
    });

    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
    document.getElementById('show-register').addEventListener('click', () => {
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('register-section').classList.remove('hidden');
    });
    document.getElementById('show-login').addEventListener('click', () => {
        document.getElementById('register-section').classList.add('hidden');
        document.getElementById('login-section').classList.remove('hidden');
    });

    const views = { profile: document.getElementById('profile-view'), grades: document.getElementById('grades-view'), stats: document.getElementById('stats-view'), users: document.getElementById('users-view'), leaderboard: document.getElementById('leaderboard-view'), chat: document.getElementById('chat-view') };
    const navButtons = { profile: document.getElementById('nav-profile'), grades: document.getElementById('nav-grades'), stats: document.getElementById('nav-stats'), users: document.getElementById('nav-users'), leaderboard: document.getElementById('nav-leaderboard'), chat: document.getElementById('nav-chat') };
    Object.keys(navButtons).forEach(key => navButtons[key].addEventListener('click', () => navigateTo(key)));
    
    document.getElementById('privacy-checkbox').addEventListener('change', (e) => savePrivacySetting(e.target.checked));
    document.getElementById('profile-settings-btn').addEventListener('click', () => { document.getElementById('profile-settings-panel').classList.toggle('hidden'); });

    document.getElementById('stats-q-selector').addEventListener('click', e => {
        if (e.target.classList.contains('q-btn')) {
            document.querySelector('#stats-q-selector .q-btn.active').classList.remove('active');
            e.target.classList.add('active');
            renderStatisticsView('stats-results-container', allGradesData);
        }
    });

    document.getElementById('search-user-button').addEventListener('click', () => {
        const usernameToSearch = document.getElementById('search-username-input').value.trim();
        searchAndDisplayUser(usernameToSearch);
    });

    document.getElementById('profile-share-btn').addEventListener('click', () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?user=${userProfile.username}`;
        navigator.clipboard.writeText(shareUrl).then(() => { alert('Ссылка на профиль скопирована!'); });
    });

    const profileInfoDisplay = document.getElementById('profile-info-display');
    const profileInfoEdit = document.getElementById('profile-info-edit');
    const profileViewActions = document.getElementById('profile-view-actions');
    const profileEditActions = document.getElementById('profile-edit-actions');
    const editUsernameInput = document.getElementById('edit-username-input');
    const editClassInput = document.getElementById('edit-class-input');

    document.getElementById('profile-edit-btn').addEventListener('click', () => {
        profileInfoDisplay.classList.add('hidden');
        profileViewActions.classList.add('hidden');
        profileInfoEdit.classList.remove('hidden');
        profileEditActions.classList.remove('hidden');
        editUsernameInput.value = userProfile.username;
        editClassInput.value = userProfile.class;
        document.getElementById('edit-profile-error').textContent = '';
    });

    document.getElementById('profile-cancel-btn').addEventListener('click', () => {
        profileInfoEdit.classList.add('hidden');
        profileEditActions.classList.add('hidden');
        profileInfoDisplay.classList.remove('hidden');
        profileViewActions.classList.remove('hidden');
    });

    document.getElementById('profile-save-btn').addEventListener('click', async () => {
        const newUsername = editUsernameInput.value.trim();
        const newClass = editClassInput.value.trim();
        const errorElement = document.getElementById('edit-profile-error');
        errorElement.textContent = '';
        if (newUsername.length < 3 || newUsername.length > 15 || !/^[a-zA-Z0-9]+$/.test(newUsername)) {
            errorElement.textContent = 'Имя: 3-15 латинских букв и цифр.'; return;
        }
        if (!newClass) {
            errorElement.textContent = 'Пожалуйста, укажите ваш класс.'; return;
        }
        const oldUsername = userProfile.username ? userProfile.username.toLowerCase() : null;
        const newUsernameLower = newUsername.toLowerCase();
        if (oldUsername === newUsernameLower) {
            db.ref(`users/${currentUser.uid}/profile`).update({ class: newClass, username: newUsername }).then(() => {
                loadUserData();
                document.getElementById('profile-cancel-btn').click();
            }).catch(err => {
                 errorElement.textContent = 'Ошибка при сохранении: ' + err.message;
            });
            return;
        }
        const newUsernameRef = db.ref(`usernames/${newUsernameLower}`);
        const snapshot = await newUsernameRef.once('value');
        if (snapshot.exists()) {
            errorElement.textContent = 'Это имя пользователя уже занято.'; return;
        }
        const updates = {};
        updates[`users/${currentUser.uid}/profile/username`] = newUsername;
        updates[`users/${currentUser.uid}/profile/class`] = newClass;
        updates[`usernames/${newUsernameLower}`] = currentUser.uid;
        if (oldUsername) {
            updates[`usernames/${oldUsername}`] = null;
        }
        db.ref().update(updates).then(() => {
            loadUserData();
            document.getElementById('profile-cancel-btn').click();
        }).catch(err => {
            errorElement.textContent = 'Ошибка при обновлении имени: ' + err.message;
        });
    });
    
    document.querySelector('#grades-view .quarter-selector').addEventListener('click', (e) => {
        if (e.target.classList.contains('q-btn')) {
            document.querySelector('#grades-view .quarter-selector .q-btn.active').classList.remove('active');
            e.target.classList.add('active');
            currentQuarter = parseInt(e.target.dataset.quarter, 10);
            if (!allGradesData[`q${currentQuarter}`]) {
                allGradesData[`q${currentQuarter}`] = getNewQuarterData();
                saveData();
            }
            renderApp();
        }
    });
    
    document.querySelector('#grades-view .tabs').addEventListener('click', e => {
        if (e.target.classList.contains('tab')) {
            document.querySelector('#grades-view .tabs .tab.active').classList.remove('active');
            e.target.classList.add('active');
            currentTabId = e.target.dataset.tabId;
            renderMainContent();
        }
    });

    document.getElementById('leaderboard-sort-controls').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const sortType = e.target.dataset.sort;
            if (sortType === currentLeaderboardSort) return;
            currentLeaderboardSort = sortType;
            document.querySelector('#leaderboard-sort-controls .button.active').classList.replace('active', 'secondary');
            e.target.classList.replace('secondary', 'active');
            renderLeaderboard();
        }
    });

    profilePictureContainer.addEventListener('click', () => {
        profilePictureInput.click();
    });
    profilePictureInput.addEventListener('change', handleProfilePictureUpload);
    
    document.getElementById('submit-post-btn').addEventListener('click', handlePostSubmit);

    postsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('post-delete-btn')) {
            const postId = e.target.dataset.postId;
            if (confirm('Вы уверены, что хотите удалить этот пост?')) {
                handleDeletePost(postId);
            }
        }
        if (e.target.classList.contains('clickable-username')) {
            const username = e.target.dataset.username;
            if (username) {
                handleUsernameClick(username);
            }
        }
    });
});


function getNewQuarterData() {
    return JSON.parse(JSON.stringify({
        "section": { "Английский язык": [{ name: "Listening", max: 5, userResult: "" },{ name: "Reading", max: 6, userResult: "" },{ name: "Writing", max: 7, userResult: "" },{ name: "Speaking", max: 6, userResult: "" }], "Биология": [{ name: "7.1A Разнообразие живых организмов", max: 18, userResult: "" },{ name: "7.1B Клеточная биология", max: 13, userResult: "" },{ name: "7.1C Вода и органические вещества", max: 12, userResult: "" }], "Всемирная история": [{ name: "Раздел 7.1A Падение Римской империи", max: 12, userResult: "" },{ name: "Раздел 7.1B Феодализм", max: 3, userResult: "" },{ name: "Раздел 7.1C История ислама", max: 15, userResult: "" }], "География": [{ name: "Географиялық зерттеу әдістері", max: 7, userResult: "" },{ name: "Картография және географиялық деректер ...", max: 10, userResult: "" },{ name: "Физикалық география \"Литосфера\"", max: 14, userResult: "" }], "Информатика": [{ name: "7.1A Социальная безопасность", max: 14, userResult: "" },{ name: "Раздел 7.1B - Аппаратное и программное об...", max: 12, userResult: "" }], "Искусство": [{ name: "Раздел 1. Портрет", max: 10, userResult: "" },{ name: "Раздел 1. Музыкальная грамотность", max: 5, userResult: "" }], "История Казахстана": [{ name: "Бөлім 7.1A VI – IX ғғ. Қазақстан", max: 14, userResult: "" }], "Казахский язык и литература": [{ name: "Тыңдалым", max: 10, userResult: "" },{ name: "Айтылым", max: 10, userResult: "" },{ name: "Оқылым", max: 20, userResult: "" },{ name: "Жазылым", max: 10, userResult: "" }], "Математика": [{ name: "7.1A Начальные геометрические сведения", max: 13, userResult: "" },{ name: "7.1B Математическое моделирование тексто...", max: 13, userResult: "" },{ name: "7.1C Степень с целым показателем", max: 16, userResult: "" }], "Русский язык и литература": [{ name: "слушание и говорение", max: 7, userResult: "" },{ name: "письмо.", max: 10, userResult: "" },{ name: "чтение.", max: 10, userResult: "" }], "Физика": [{ name: "7.1A Физические величины и измерения", max: 16, userResult: "" },{ name: "Движение", max: 16, userResult: "" }], "Физическая культура": [{ name: "Раздел 1 - Легкая атлетика", max: 10, userResult: "" },{ name: "Раздел 2 - Взаимодействие в командных сп...", max: 10, userResult: "" }], "Химия": [{ name: "7.1A Введение в химию. Элементы, соедине...", max: 18, userResult: "" },{ name: "7.1B Изменения агрегатного состояния веще...", max: 22, userResult: "" }] },
        "quarter": { "Английский язык": [{ name: "Listening", max: 6, userResult: "" }, { name: "Reading", max: 6, userResult: "" }, { name: "Writing", max: 6, userResult: "" }, { name: "Speaking", max: 6, userResult: "" }], "Биология": [{ name: "7.1A Разнообразие живых организмов", max: 8, userResult: "" }, { name: "7.1B Клеточная биология", max: 10, userResult: "" }, { name: "7.1C Вода и органические вещества", max: 12, userResult: "" }], "Всемирная история": [{ name: "Раздел 7.1A Падение Римской империи", max: 9, userResult: "" }, { name: "Раздел 7.1B Феодализм", max: 10, userResult: "" }, { name: "Раздел 7.1C История ислама", max: 6, userResult: "" }], "География": [{ name: "Географиялық зерттеу әдістері", max: 4, userResult: "" }, { name: "Картография және географиялық деректер ...", max: 11, userResult: "" }, { name: "Физикалық география \"Литосфера\"", max: 10, userResult: "" }], "Информатика": [{ name: "7.1A Социальная безопасность", max: 4, userResult: "" }, { name: "Раздел 7.1B - Аппаратное и программное об...", max: 16, userResult: "" }], "Искусство": [{ name: "Раздел 1. Портрет", max: 15, userResult: "" }, { name: "Раздел 1. Музыкальная грамотность", max: 15, userResult: "" }], "История Казахстана": [{ name: "Бөлім 7.1A VI – IX ғғ. Қазақстан", max: 25, userResult: "" }], "Казахский язык и литература": [{ name: "Тыңдалым", max: 10, userResult: "" }, { name: "Айтылым", max: 10, userResult: "" }, { name: "Оқылым", max: 10, userResult: "" }, { name: "Жазылым", max: 10, userResult: "" }], "Математика": [{ name: "7.1A Начальные геометрические сведения", max: 7, userResult: "" }, { name: "7.1B Математическое моделирование тексто...", max: 6, userResult: "" }, { name: "7.1C Степень с целым показателем", max: 17, userResult: "" }], "Русский язык и литература": [{ name: "слушание и говорение", max: 10, userResult: "" }, { name: "письмо.", max: 10, userResult: "" }, { name: "чтение.", max: 10, userResult: "" }], "Физика": [{ name: "7.1A Физические величины и измерения", max: 12, userResult: "" }, { name: "Движение", max: 18, userResult: "" }], "Физическая культура": [], "Химия": [{ name: "7.1A Введение в химию. Элементы, соедине...", max: 16, userResult: "" }, { name: "7.1B Изменения агрегатного состояния веще...", max: 14, userResult: "" }] }
    }));
}
function getFriendlyAuthError(errorCode) {
    switch (errorCode) { case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': return 'Неверный email или пароль.'; case 'auth/email-already-in-use': return 'Этот email уже зарегистрирован.'; case 'auth/weak-password': return 'Пароль слишком слабый (минимум 6 символов).'; case 'auth/invalid-email': return 'Некорректный формат email.'; default: return 'Произошла неизвестная ошибка.'; }
}

function saveData() { if (!currentUser) return; clearTimeout(saveDataTimeout); saveDataTimeout = setTimeout(() => { db.ref(`users/${currentUser.uid}/grades`).set(allGradesData); }, 1500); }
function savePrivacySetting(isPublic) { if (!currentUser) return; db.ref(`users/${currentUser.uid}/profile/isPublic`).set(isPublic); }

function loadUserData() {
    return new Promise((resolve) => {
        if (!currentUser) return resolve();
        const userDisplayNameElement = document.getElementById('user-display-name');
        const profileUsername = document.getElementById('profile-username');
        const profileClass = document.getElementById('profile-class');
        const privacyCheckbox = document.getElementById('privacy-checkbox');
        const profilePictureImg = document.getElementById('profile-picture-img');
        
        db.ref(`users/${currentUser.uid}`).once('value').then(snapshot => {
            const data = snapshot.val() || {};
            userProfile = data.profile || {};
            allGradesData = data.grades || {};
            userDisplayNameElement.textContent = `Пользователь: ${userProfile.username || '...'}`;
            profileUsername.textContent = userProfile.username || 'Имя не указано';
            profileClass.textContent = `Класс: ${userProfile.class || 'Не указан'}`;
            privacyCheckbox.checked = userProfile.isPublic === true;

            if (userProfile.photoURL) {
                profilePictureImg.src = userProfile.photoURL;
            } else {
                profilePictureImg.src = 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png';
            }

            if (!allGradesData[`q${currentQuarter}`]) { allGradesData[`q${currentQuarter}`] = getNewQuarterData(); }
            renderApp();
            renderProfileDashboard();
            resolve();
        });
    });
}

function renderApp() { renderSidebar(); renderMainContent(); const dataForQuarter = allGradesData[`q${currentQuarter}`]; if (dataForQuarter && dataForQuarter.section) { Object.keys(dataForQuarter.section).forEach(calculateAndUpdateSubject); } }

function navigateTo(viewName) { 
    const views = { profile: document.getElementById('profile-view'), grades: document.getElementById('grades-view'), stats: document.getElementById('stats-view'), users: document.getElementById('users-view'), leaderboard: document.getElementById('leaderboard-view'), chat: document.getElementById('chat-view') };
    const navButtons = { profile: document.getElementById('nav-profile'), grades: document.getElementById('nav-grades'), stats: document.getElementById('nav-stats'), users: document.getElementById('nav-users'), leaderboard: document.getElementById('nav-leaderboard'), chat: document.getElementById('nav-chat') };
    Object.values(views).forEach(v => v.classList.add('hidden')); 
    Object.values(navButtons).forEach(b => b.classList.remove('active')); 
    views[viewName].classList.remove('hidden'); 
    navButtons[viewName].classList.add('active'); 
    if (viewName === 'stats') { renderStatisticsView('stats-results-container', allGradesData); } 
    if (viewName === 'profile') { renderProfileDashboard(); } 
    if (viewName === 'leaderboard') { renderLeaderboard(); } 
    if (viewName === 'chat') { renderChatView(); } 
}

function renderStatisticsView(containerId, gradesData, isFriend = false) {
    const container = document.getElementById(containerId);
    let quarterSelectorId = isFriend ? '#friend-stats-q-selector' : '#stats-q-selector';
    let statsQuarter = 1;
    const activeQBtn = document.querySelector(`${quarterSelectorId} .q-btn.active`);
    if (activeQBtn) { statsQuarter = activeQBtn.dataset.quarter; }
    
    const quarterData = gradesData[`q${statsQuarter}`];
    
    container.innerHTML = `<div class="gauge-container"><svg viewBox="0 0 100 50" class="gauge"><path class="gauge-bg" d="M 10 50 A 40 40 0 0 1 90 50"></path><path class="gauge-fg" d="M 10 50 A 40 40 0 0 1 90 50"></path></svg><div class="gauge-text">--</div><div class="gauge-min-max"><span>2</span><span>5</span></div></div><div class="stats-avg-grade-text"></div><div class="stats-details"><div class="stat-item"><strong>Средний %:</strong><span>--</span></div><div class="stat-item"><strong>Лучший предмет:</strong><span>--</span></div><div class="stat-item"><strong>Худший предмет:</strong><span>--</span></div></div>`;

    if (!quarterData) {
        container.querySelector('.stats-avg-grade-text').textContent = 'Нет данных для этой четверти.';
        return;
    }

    let subjectPerformances = [];
    Object.keys(quarterData.section).forEach(subject => {
        const percentage = calculateFinalPercentageForFriend(subject, quarterData);
        if (percentage > 0) {
            subjectPerformances.push({ name: subject, percentage: percentage, grade: getGradeFromPercentage(percentage) });
        }
    });

    if (subjectPerformances.length === 0) {
        container.querySelector('.stats-avg-grade-text').textContent = 'Нет данных для расчета.';
        return;
    }

    const totalGrade = subjectPerformances.reduce((sum, p) => sum + p.grade, 0);
    const totalPercentage = subjectPerformances.reduce((sum, p) => sum + p.percentage, 0);
    const averageGrade = totalGrade / subjectPerformances.length;
    const averagePercentage = totalPercentage / subjectPerformances.length;

    const bestSubject = subjectPerformances.reduce((best, current) => current.percentage > best.percentage ? current : best, subjectPerformances[0]);
    const worstSubject = subjectPerformances.reduce((worst, current) => current.percentage < worst.percentage ? current : worst, subjectPerformances[0]);
    
    const gaugeElement = container.querySelector('.gauge-fg');
    const gaugeText = container.querySelector('.gauge-text');
    const statsAvgText = container.querySelector('.stats-avg-grade-text');
    const detailsContainer = container.querySelector('.stats-details');
    
    statsAvgText.textContent = `Средняя оценка по предметам: ${averageGrade.toFixed(2)}`;
    gaugeText.textContent = averageGrade.toFixed(2);
    
    detailsContainer.innerHTML = `<div class="stat-item"><strong>Средний %:</strong><span>${averagePercentage.toFixed(2)} %</span></div><div class="stat-item"><strong>Лучший предмет:</strong><span>${bestSubject.name} (${bestSubject.percentage.toFixed(2)}%)</span></div><div class="stat-item"><strong>Худший предмет:</strong><span>${worstSubject.name} (${worstSubject.percentage.toFixed(2)}%)</span></div>`;

    const gaugePathLength = gaugeElement.getTotalLength();
    gaugeElement.style.strokeDasharray = gaugePathLength;
    const normalizedValue = Math.max(0, Math.min(1, (averageGrade - 2) / (5 - 2)));
    const offset = gaugePathLength * (1 - normalizedValue);
    
    const hue = normalizedValue * 120;
    gaugeElement.style.stroke = `hsl(${hue}, 90%, 45%)`;
    gaugeElement.style.strokeDashoffset = offset;
}

function renderProfileDashboard() {
    renderStatisticsView('profile-stats-container', { q1: allGradesData.q1, q2: allGradesData.q2, q3: allGradesData.q3, q4: allGradesData.q4 });
    const summaryBody = document.getElementById('profile-grades-summary-body');
    summaryBody.innerHTML = '';
    const quarterData = allGradesData[`q${currentQuarter}`];
    if (quarterData && quarterData.section) {
        Object.keys(quarterData.section).forEach((subject, index) => {
            const percentage = calculateFinalPercentageForFriend(subject, quarterData);
            const grade = getGradeFromPercentage(percentage);
            const row = document.createElement('tr');
            row.innerHTML = `<td>${index + 1}</td><td>${subject}</td><td class="subject-percentage">${percentage > 0 ? percentage.toFixed(2) + ' %' : '-- %'}</td><td class="subject-grade">${percentage > 0 ? grade : '-'}</td>`;
            summaryBody.appendChild(row);
        });
    } else {
        summaryBody.innerHTML = '<tr><td colspan="4">Нет данных для этой четверти.</td></tr>';
    }
}

function searchAndDisplayUser(username, byLink = false) {
    const resultsContainer = document.getElementById('friend-results-container');
    if (!username) { resultsContainer.innerHTML = `<p class="no-data-message">Введите имя пользователя.</p>`; return; }
    resultsContainer.innerHTML = `<p class="no-data-message">Поиск...</p>`;
    db.ref(`usernames/${username.toLowerCase()}`).once('value').then(snapshot => {
        if (!snapshot.exists()) { resultsContainer.innerHTML = `<p class="no-data-message">Пользователь не найден.</p>`; return; }
        const friendUid = snapshot.val();
        db.ref(`users/${friendUid}`).once('value').then(userSnapshot => {
            const friendData = userSnapshot.val();
            if (!friendData || !friendData.profile || (!friendData.profile.isPublic && !byLink)) { resultsContainer.innerHTML = `<p class="no-data-message">Пользователь не найден или его профиль скрыт.</p>`; return; }
            renderFriendData(friendData, resultsContainer);
        });
    });
}

function handleUrlParams() { const params = new URLSearchParams(window.location.search); const userToSearch = params.get('user'); if (userToSearch) { navigateTo('users'); document.getElementById('search-username-input').value = userToSearch; searchAndDisplayUser(userToSearch, true); history.replaceState(null, '', window.location.pathname); } }

function getGradeFromPercentage(percentage) {
    const roundedPercentage = Math.round(percentage);
    if (roundedPercentage >= 85) return 5;
    if (roundedPercentage >= 65) return 4;
    if (roundedPercentage >= 40) return 3;
    return 2;
}
function calculateFinalPercentage(sorResult, sorMax, sochResult, sochMax) { let hasSors = sorMax > 0, hasSochs = sochMax > 0, finalPercentage = 0; if (hasSors && hasSochs) { finalPercentage = ((sorResult / sorMax) * 0.5 + (sochResult / sochMax) * 0.5) * 100; } else if (hasSors) { finalPercentage = (sorResult / sorMax) * 100; } else if (hasSochs) { finalPercentage = (sochResult / sochMax) * 100; } return finalPercentage; }
function calculateFinalPercentageForFriend(subjectName, quarterData) { let sumSorResult = 0, sumSorMax = 0, sumSochResult = 0, sumSochMax = 0; if(quarterData && quarterData.section) { (quarterData.section[subjectName] || []).forEach(task => { const result = parseFloat(task.userResult); if (!isNaN(result)) { sumSorResult += result; sumSorMax += task.max; } }); } if(quarterData && quarterData.quarter) { (quarterData.quarter[subjectName] || []).forEach(task => { const result = parseFloat(task.userResult); if (!isNaN(result)) { sumSochResult += result; sumSochMax += task.max; } }); } return calculateFinalPercentage(sumSorResult, sumSorMax, sumSochResult, sumSochMax); }
function calculateAndUpdateSubject(subjectName) { const finalPercentage = calculateFinalPercentageForFriend(subjectName, allGradesData[`q${currentQuarter}`]); const grade = getGradeFromPercentage(finalPercentage); const myGradesSidebarBody = document.getElementById('my-grades-sidebar-body'); const subjectRow = myGradesSidebarBody.querySelector(`tr[data-subject="${subjectName}"]`); if (subjectRow) { const percentageCell = subjectRow.querySelector('.subject-percentage'); const gradeCell = subjectRow.querySelector('.subject-grade'); if (finalPercentage > 0) { percentageCell.textContent = `${finalPercentage.toFixed(2)} %`; gradeCell.textContent = grade; } else { percentageCell.textContent = '-- %'; gradeCell.textContent = '-'; } } }
function calculateRequiredScore(targetGrade, subjectName, currentTaskTab, currentTaskIndex) { const gradeTargets = { 5: 85, 4: 65, 3: 40 }; const targetPercentage = gradeTargets[targetGrade]; if (!targetPercentage) return 0; let otherSorResult = 0, otherSorMax = 0, otherSochResult = 0, otherSochMax = 0; const dataForQuarter = allGradesData[`q${currentQuarter}`]; (dataForQuarter.section[subjectName] || []).forEach((task, index) => { if (currentTaskTab === 'section' && index === currentTaskIndex) return; const result = parseFloat(task.userResult); if (!isNaN(result)) { otherSorResult += result; otherSorMax += task.max; } }); (dataForQuarter.quarter[subjectName] || []).forEach((task, index) => { if (currentTaskTab === 'quarter' && index === currentTaskIndex) return; const result = parseFloat(task.userResult); if (!isNaN(result)) { otherSochResult += result; otherSochMax += task.max; } }); const currentTask = dataForQuarter[currentTaskTab][subjectName][currentTaskIndex]; const maxForCurrent = currentTask.max; for (let x = 0; x <= maxForCurrent; x++) { let potentialSorResult = otherSorResult, potentialSorMax = otherSorMax, potentialSochResult = otherSochResult, potentialSochMax = otherSochMax; if (currentTaskTab === 'section') { potentialSorResult += x; potentialSorMax += maxForCurrent; } else { potentialSochResult += x; potentialSochMax += maxForCurrent; } const potentialFinalPercentage = calculateFinalPercentage(potentialSorResult, potentialSorMax, potentialSochResult, potentialSochMax); if (potentialFinalPercentage >= targetPercentage) return x; } return 0; }
function handleInputChange(event) { const input = event.target; const subject = input.dataset.subject; const tab = input.dataset.tab; const index = parseInt(input.dataset.index, 10); const value = input.value; const dataForQuarter = allGradesData[`q${currentQuarter}`]; const match = value.match(/^%([345])$/); if (match) { const targetGrade = parseInt(match[1], 10); const requiredScore = calculateRequiredScore(targetGrade, subject, tab, index); input.value = requiredScore; dataForQuarter[tab][subject][index].userResult = requiredScore; } else { let numericValue = parseFloat(value); const max = dataForQuarter[tab][subject][index].max; if (numericValue > max) { numericValue = max; input.value = max; } if (numericValue < 0) { numericValue = 0; input.value = 0; } dataForQuarter[tab][subject][index].userResult = isNaN(numericValue) ? "" : numericValue; } calculateAndUpdateSubject(subject); saveData(); }
function renderMainContent() { const contentDisplay = document.getElementById('content-display'); const dataForQuarter = allGradesData[`q${currentQuarter}`]; if (!dataForQuarter) { contentDisplay.innerHTML = `<div class="no-data-message">Данные для этой четверти еще не созданы.</div>`; return; } const data = dataForQuarter[currentTabId]?.[currentSubject]; let tableHTML = `<table><thead><tr><th></th><th>Наименование</th><th>Результат</th><th>Максимум</th></tr></thead><tbody>`; if (!data || data.length === 0) { contentDisplay.innerHTML = `<div class="no-data-message">Данные отсутствуют.</div>`; return; } data.forEach((item, index) => { tableHTML += `<tr><td>${index + 1}</td><td>${item.name}</td><td><input type="text" value="${item.userResult || ''}" data-subject="${currentSubject}" data-tab="${currentTabId}" data-index="${index}"></td><td class="max-col">${item.max}</td></tr>`; }); tableHTML += `</tbody></table>`; contentDisplay.innerHTML = tableHTML; contentDisplay.querySelectorAll('input').forEach(input => { input.addEventListener('change', handleInputChange); }); }
function renderSidebar() { const myGradesSidebarBody = document.getElementById('my-grades-sidebar-body'); myGradesSidebarBody.innerHTML = ''; const dataForQuarter = allGradesData[`q${currentQuarter}`]; if(!dataForQuarter || !dataForQuarter.section) return; const subjects = Object.keys(dataForQuarter.section); subjects.forEach((subject, index) => { const row = document.createElement('tr'); row.dataset.subject = subject; row.innerHTML = `<td>${index + 1}</td><td>${subject}</td><td class="subject-percentage">-- %</td><td class="subject-grade">-</td>`; myGradesSidebarBody.appendChild(row); }); const selectedRow = myGradesSidebarBody.querySelector(`tr[data-subject="${currentSubject}"]`); if(selectedRow) selectedRow.classList.add('selected'); myGradesSidebarBody.querySelectorAll('tr').forEach(row => { row.addEventListener('click', function() { if (myGradesSidebarBody.querySelector('.selected')) myGradesSidebarBody.querySelector('.selected').classList.remove('selected'); this.classList.add('selected'); currentSubject = this.dataset.subject; renderMainContent(); }); }); }

function renderFriendData(friendData, container) {
    const friendGrades = friendData.grades || {}; const friendProfile = friendData.profile; container.innerHTML = `<h3>Профиль: ${friendProfile.username} (Класс: ${friendProfile.class || 'Не указан'})</h3><div class="friend-data-section"><h4>Статистика</h4><div class="quarter-selector" id="friend-stats-q-selector"><button class="q-btn active" data-quarter="1">1</button><button class="q-btn" data-quarter="2">2</button><button class="q-btn" data-quarter="3">3</button><button class="q-btn" data-quarter="4">4</button></div><div id="friend-stats-results-container" class="stats-container" style="box-shadow: none; border: none; padding: 0;"></div></div><div class="friend-data-section"><h4>Оценки</h4><div class="content-card wide" style="box-shadow: none; border: none; padding: 0;"><div class="sidebar"><table><thead><tr><th></th><th>Предмет</th><th>Общий %</th><th>Оценка</th></tr></thead><tbody id="friend-sidebar-body"></tbody></table></div><div class="main-content"><div class="quarter-selector" id="friend-grades-q-selector"><button class="q-btn active" data-quarter="1">1</button><button class="q-btn" data-quarter="2">2</button><button class="q-btn" data-quarter="3">3</button><button class="q-btn" data-quarter="4">4</button></div><div class="tabs" id="friend-tabs"><div class="tab active" data-tab-id="section">СОР</div><div class="tab" data-tab-id="quarter">СОЧ</div></div><div id="friend-content-display"></div></div></div></div>`;
    let fq = 1, ft = 'section', fs = "Английский язык";
    const friendStatsQSelector = document.getElementById('friend-stats-q-selector'); const friendGradesQSelector = document.getElementById('friend-grades-q-selector'); const friendTabs = document.getElementById('friend-tabs');
    const renderFriendGradesView = () => { const sb = document.getElementById('friend-sidebar-body'); const cd = document.getElementById('friend-content-display'); const qd = friendGrades[`q${fq}`] || getNewQuarterData(); sb.innerHTML = ''; Object.keys(qd.section).forEach((s, i) => { const p = calculateFinalPercentageForFriend(s, qd); const g = getGradeFromPercentage(p); const r = document.createElement('tr'); r.dataset.subject = s; r.innerHTML = `<td>${i + 1}</td><td>${s}</td><td class="subject-percentage">${p > 0 ? p.toFixed(2) + ' %' : '-- %'}</td><td class="subject-grade">${p > 0 ? g : '-'}</td>`; if (s === fs) r.classList.add('selected'); sb.appendChild(r); }); const d = qd[ft]?.[fs]; let th = `<table><thead><tr><th></th><th>Наименование</th><th>Результат</th><th>Максимум</th></tr></thead><tbody>`; if (d && d.length > 0) { d.forEach((i, x) => { th += `<tr><td>${x + 1}</td><td>${i.name}</td><td class="readonly-result">${i.userResult || '-'}</td><td class="max-col">${i.max}</td></tr>`; }); } th += `</tbody></table>`; cd.innerHTML = th; sb.querySelectorAll('tr').forEach(r => r.addEventListener('click', function() { fs = this.dataset.subject; renderFriendGradesView(); })); };
    const renderFriendDataViews = () => { renderStatisticsView('friend-stats-results-container', friendGrades, true); renderFriendGradesView(); };
    const handleFriendQSelector = (e) => { if (e.target.classList.contains('q-btn')) { fq = parseInt(e.target.dataset.quarter, 10); friendStatsQSelector.querySelector('.active').classList.remove('active'); friendGradesQSelector.querySelector('.active').classList.remove('active'); friendStatsQSelector.children[fq-1].classList.add('active'); friendGradesQSelector.children[fq-1].classList.add('active'); renderFriendDataViews(); }};
    friendStatsQSelector.addEventListener('click', handleFriendQSelector); friendGradesQSelector.addEventListener('click', handleFriendQSelector);
    friendTabs.addEventListener('click', e => { if (e.target.classList.contains('tab')) { friendTabs.querySelector('.active').classList.remove('active'); e.target.classList.add('active'); ft = e.target.dataset.tabId; renderFriendGradesView(); }});
    renderFriendDataViews();
}

function calculateOverallStats(gradesData) {
    const allPercentages = []; const allGrades = [];
    for (const quarterKey in gradesData) {
        if (gradesData.hasOwnProperty(quarterKey)) {
            const quarterData = gradesData[quarterKey];
            if (quarterData && quarterData.section) {
                for (const subjectName in quarterData.section) {
                    if (quarterData.section.hasOwnProperty(subjectName)) {
                        const percentage = calculateFinalPercentageForFriend(subjectName, quarterData);
                        if (percentage > 0) {
                            allPercentages.push(percentage);
                            allGrades.push(getGradeFromPercentage(percentage));
                        }
                    }
                }
            }
        }
    }
    if (allPercentages.length === 0) { return { averagePercentage: 0, averageGrade: 0 }; }
    const avgPercentage = allPercentages.reduce((a, b) => a + b, 0) / allPercentages.length;
    const avgGrade = allGrades.reduce((a, b) => a + b, 0) / allGrades.length;
    return { averagePercentage: avgPercentage, averageGrade: avgGrade };
}

async function renderLeaderboard() {
    const container = document.getElementById('leaderboard-table-container');
    container.innerHTML = '<p>Загрузка данных...</p>';
    try {
        const usersRef = db.ref('users');
        const snapshot = await usersRef.orderByChild('profile/isPublic').equalTo(true).once('value');
        if (!snapshot.exists()) {
            container.innerHTML = '<p>Нет публичных профилей для отображения.</p>'; return;
        }
        let leaderboardData = [];
        snapshot.forEach(childSnapshot => {
            const user = childSnapshot.val();
            if (user.profile && user.grades) {
                const stats = calculateOverallStats(user.grades);
                if (stats.averagePercentage > 0) { 
                    leaderboardData.push({
                        username: user.profile.username,
                        averagePercentage: stats.averagePercentage,
                        averageGrade: stats.averageGrade
                    });
                }
            }
        });
        if (leaderboardData.length === 0) {
            container.innerHTML = '<p>Нет пользователей с введенными оценками.</p>'; return;
        }
        leaderboardData.sort((a, b) => {
            if (currentLeaderboardSort === 'percentage') {
                return b.averagePercentage - a.averagePercentage;
            } else {
                return b.averageGrade - a.averageGrade;
            }
        });
        let tableHTML = `<table class="leaderboard-table"><thead><tr><th class="rank-col">#</th><th>Пользователь</th><th class="number-col">Средний %</th><th class="number-col">Средняя оценка</th></tr></thead><tbody>`;
        leaderboardData.forEach((player, index) => {
            tableHTML += `<tr><td class="rank-col">${index + 1}</td><td>${player.username}</td><td class="number-col">${player.averagePercentage.toFixed(2)} %</td><td class="number-col">${player.averageGrade.toFixed(2)}</td></tr>`;
        });
        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    } catch (error) {
        console.error("Ошибка при загрузке лидерборда:", error);
        container.innerHTML = '<p>Не удалось загрузить данные. Попробуйте позже.</p>';
    }
}

function handlePostSubmit() {
    const postTextInput = document.getElementById('post-text-input');
    const isAnonymous = document.getElementById('post-anonymous-checkbox').checked;
    const text = postTextInput.value.trim();
    if (!text) {
        alert('Нельзя отправить пустой пост.'); return;
    }
    const postData = {
        uid: currentUser.uid,
        username: isAnonymous ? 'Аноним' : userProfile.username,
        text: text,
        isAnonymous: isAnonymous,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    db.ref('posts').push(postData)
        .then(() => {
            postTextInput.value = '';
            document.getElementById('post-anonymous-checkbox').checked = false;
        })
        .catch(error => {
            console.error("Ошибка при отправке поста:", error);
            alert("Не удалось отправить пост. Попробуйте снова.");
        });
}

function handleDeletePost(postId) {
    db.ref('posts/' + postId).remove()
        .catch(error => {
            console.error("Ошибка при удалении поста:", error);
            alert("Не удалось удалить пост. У вас может не быть прав на это действие.");
        });
}

function formatTimestamp(ts) {
    const date = new Date(ts);
    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderChatView() {
    const postsContainer = document.getElementById('posts-container');
    const postsRef = db.ref('posts').orderByChild('timestamp').limitToLast(100);
    postsRef.on('value', (snapshot) => {
        postsContainer.innerHTML = '';
        if (!snapshot.exists()) {
            postsContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Здесь пока нет постов. Будьте первым!</p>'; return;
        }
        const postsData = [];
        snapshot.forEach(childSnapshot => {
            postsData.push({ id: childSnapshot.key, ...childSnapshot.val() });
        });
        let postsHtml = '';
        postsData.reverse().forEach(post => {
            let authorHtml;
            if (post.isAnonymous) {
                authorHtml = `<span class="post-author anonymous">${post.username}</span>`;
            } else {
                authorHtml = `<span class="post-author clickable-username" data-username="${post.username}">${post.username}</span>`;
            }
            const deleteButtonHtml = post.uid === currentUser.uid 
                ? `<button class="post-delete-btn" data-post-id="${post.id}">&times;</button>` 
                : '';
            postsHtml += `
                <div class="post-card">
                    ${deleteButtonHtml}
                    <div class="post-header">
                        ${authorHtml}
                        <span class="post-timestamp">${formatTimestamp(post.timestamp)}</span>
                    </div>
                    <p class="post-body">${post.text}</p>
                </div>
            `;
        });
        postsContainer.innerHTML = postsHtml;
    }, (error) => {
        console.error("Ошибка при загрузке постов:", error);
        postsContainer.innerHTML = '<p>Не удалось загрузить посты.</p>';
    });
}

async function handleProfilePictureUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите файл изображения.'); return;
    }
    if (file.size > 5 * 1024 * 1024) { // 5 МБ
        alert('Файл слишком большой. Максимальный размер - 5 МБ.'); return;
    }

    // --- НАСТРОЙКИ CLOUDINARY (замените на свои) ---
    const CLOUD_NAME = "dqj6o60sc"; // Возьмите из дашборда Cloudinary
    const UPLOAD_PRESET = "ml_default"; // Возьмите из настроек Cloudinary -> Upload
    // ------------------------------------------------

    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    const profilePictureContainer = document.getElementById('profile-picture-container');
    const profilePictureImg = document.getElementById('profile-picture-img');
    
    profilePictureContainer.classList.add('loading');

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Ошибка при загрузке изображения.');
        }

        const data = await response.json();
        const downloadURL = data.secure_url;

        await db.ref(`users/${currentUser.uid}/profile/photoURL`).set(downloadURL);

        profilePictureImg.src = downloadURL;

    } catch (error) {
        console.error('Ошибка загрузки фото в Cloudinary:', error);
        alert('Не удалось загрузить фото. Попробуйте снова.');
    } finally {
        profilePictureContainer.classList.remove('loading');
    }
}

function handleUsernameClick(username) {
    navigateTo('users');
    document.getElementById('search-username-input').value = username;
    searchAndDisplayUser(username);
}
