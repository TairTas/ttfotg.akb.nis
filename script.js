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

let currentUser = null, userProfile = {}, currentQuarter = 1, currentSubject = "Английский язык", currentTabId = "section", allGradesData = {}, saveDataTimeout;
let currentLeaderboardSort = 'percentage';
let selectedPostFile = null;
let postsRef = null;
let postsListener = null;
let allUsersDataCache = null;

document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app-container');
    const authOverlay = document.getElementById('auth-overlay');
    const profilePictureContainer = document.getElementById('profile-picture-container');
    const profilePictureInput = document.getElementById('profile-picture-input');
    const postsContainer = document.getElementById('posts-container');
    const attachPhotoButton = document.getElementById('attach-photo-btn');
    const postImageInput = document.getElementById('post-image-input');
    const removePostImageButton = document.getElementById('remove-post-image-btn');
    const leaderboardFilter = document.getElementById('leaderboard-filter-complete');
    
    auth.onAuthStateChanged(async (user) => {
        const userDisplayNameElement = document.getElementById('user-display-name');
        if (user) {
            await user.getIdToken(true);
            currentUser = user;
            authOverlay.classList.add('hidden');
            appContainer.classList.remove('hidden');
            loadUserData().then(() => { handleUrlParams(); });
        } else {
            currentUser = null;
            if (userDisplayNameElement) userDisplayNameElement.textContent = '';
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

    const views = { profile: document.getElementById('profile-view'), grades: document.getElementById('grades-view'), stats: document.getElementById('stats-view'), users: document.getElementById('users-view'), leaderboard: document.getElementById('leaderboard-view'), chat: document.getElementById('chat-view'), admin: document.getElementById('admin-panel-view') };
    const navButtons = { profile: document.getElementById('nav-profile'), grades: document.getElementById('nav-grades'), stats: document.getElementById('nav-stats'), users: document.getElementById('nav-users'), leaderboard: document.getElementById('nav-leaderboard'), chat: document.getElementById('nav-chat'), admin: document.getElementById('nav-admin') };
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
    leaderboardFilter.addEventListener('change', renderLeaderboard);

    profilePictureContainer.addEventListener('click', () => profilePictureInput.click());
    profilePictureInput.addEventListener('change', handleProfilePictureUpload);
    
    attachPhotoButton.addEventListener('click', () => postImageInput.click());
    postImageInput.addEventListener('change', handlePostImageSelection);
    removePostImageButton.addEventListener('click', removeSelectedPostImage);
    
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
        if (e.target.classList.contains('post-image')) {
            window.open(e.target.src, '_blank');
        }
    });

    // Обработчики для вкладок админ-панели
    document.getElementById('admin-tab-users').addEventListener('click', () => switchAdminTab('users'));
    document.getElementById('admin-tab-posts').addEventListener('click', () => switchAdminTab('posts'));
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

            const adminNavButton = document.getElementById('nav-admin');
            currentUser.getIdTokenResult().then(idTokenResult => {
                if (!!idTokenResult.claims.admin) {
                    adminNavButton.classList.remove('hidden');
                } else {
                    adminNavButton.classList.add('hidden');
                }
            });

            if (!allGradesData[`q${currentQuarter}`]) { allGradesData[`q${currentQuarter}`] = getNewQuarterData(); }
            renderApp();
            renderProfileDashboard();
            resolve();
        });
    });
}
function renderApp() { renderSidebar(); renderMainContent(); const dataForQuarter = allGradesData[`q${currentQuarter}`]; if (dataForQuarter && dataForQuarter.section) { Object.keys(dataForQuarter.section).forEach(calculateAndUpdateSubject); } }
function navigateTo(viewName) { 
    if (postsRef && postsListener) {
        postsRef.off('value', postsListener);
        postsRef = null;
        postsListener = null;
    }
    const views = { profile: document.getElementById('profile-view'), grades: document.getElementById('grades-view'), stats: document.getElementById('stats-view'), users: document.getElementById('users-view'), leaderboard: document.getElementById('leaderboard-view'), chat: document.getElementById('chat-view'), admin: document.getElementById('admin-panel-view') };
    const navButtons = { profile: document.getElementById('nav-profile'), grades: document.getElementById('nav-grades'), stats: document.getElementById('nav-stats'), users: document.getElementById('nav-users'), leaderboard: document.getElementById('nav-leaderboard'), chat: document.getElementById('nav-chat'), admin: document.getElementById('nav-admin') };
    Object.values(views).forEach(v => v.classList.add('hidden')); 
    Object.values(navButtons).forEach(b => b.classList.remove('active')); 
    views[viewName].classList.remove('hidden'); 
    navButtons[viewName].classList.add('active'); 
    if (viewName === 'stats') { renderStatisticsView('stats-results-container', allGradesData); } 
    if (viewName === 'profile') { renderProfileDashboard(); } 
    if (viewName === 'leaderboard') { renderLeaderboard(); } 
    if (viewName === 'chat') { renderChatView(); } 
    if (viewName === 'admin') { renderAdminPanel(); }
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
        if (percentage !== null && percentage >= 0) {
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
            row.innerHTML = `<td>${index + 1}</td><td>${subject}</td><td class="subject-percentage">${(percentage !== null && percentage >= 0) ? percentage.toFixed(2) + ' %' : '-- %'}</td><td class="subject-grade">${(percentage !== null && percentage >= 0) ? grade : '-'}</td>`;
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
function getGradeFromPercentage(percentage) { if (percentage === null) return '-'; const roundedPercentage = Math.round(percentage); if (roundedPercentage >= 85) return 5; if (roundedPercentage >= 65) return 4; if (roundedPercentage >= 40) return 3; return 2; }
function calculateFinalPercentage(sorResult, sorMax, sochResult, sochMax) { let hasSors = sorMax > 0, hasSochs = sochMax > 0, finalPercentage = 0; if (hasSors && hasSochs) { finalPercentage = ((sorResult / sorMax) * 0.5 + (sochResult / sochMax) * 0.5) * 100; } else if (hasSors) { finalPercentage = (sorResult / sorMax) * 100; } else if (hasSochs) { finalPercentage = (sochResult / sochMax) * 100; } return finalPercentage; }

function calculateFinalPercentageForFriend(subjectName, quarterData) {
    let sumSorResult = 0, sumSorMax = 0, sumSochResult = 0, sumSochMax = 0, hasInputs = false;
    if (quarterData && quarterData.section) {
        (quarterData.section[subjectName] || []).forEach(task => {
            const result = parseFloat(task.userResult);
            if (!isNaN(result)) {
                hasInputs = true;
                sumSorResult += result;
                sumSorMax += task.max;
            }
        });
    }
    if (quarterData && quarterData.quarter) {
        (quarterData.quarter[subjectName] || []).forEach(task => {
            const result = parseFloat(task.userResult);
            if (!isNaN(result)) {
                hasInputs = true;
                sumSochResult += result;
                sumSochMax += task.max;
            }
        });
    }
    if (!hasInputs) {
        return null;
    }
    return calculateFinalPercentage(sumSorResult, sumSorMax, sumSochResult, sumSochMax);
}

function calculateAndUpdateSubject(subjectName) {
    const finalPercentage = calculateFinalPercentageForFriend(subjectName, allGradesData[`q${currentQuarter}`]);
    const grade = getGradeFromPercentage(finalPercentage);
    const myGradesSidebarBody = document.getElementById('my-grades-sidebar-body');
    const subjectRow = myGradesSidebarBody.querySelector(`tr[data-subject="${subjectName}"]`);
    if (subjectRow) {
        const percentageCell = subjectRow.querySelector('.subject-percentage');
        const gradeCell = subjectRow.querySelector('.subject-grade');
        if (finalPercentage !== null) {
            percentageCell.textContent = `${finalPercentage.toFixed(2)} %`;
            gradeCell.textContent = grade;
        } else {
            percentageCell.textContent = '-- %';
            gradeCell.textContent = '-';
        }
    }
}
function calculateRequiredScore(targetGrade, subjectName, currentTaskTab, currentTaskIndex) { const gradeTargets = { 5: 85, 4: 65, 3: 40 }; const targetPercentage = gradeTargets[targetGrade]; if (!targetPercentage) return 0; let otherSorResult = 0, otherSorMax = 0, otherSochResult = 0, otherSochMax = 0; const dataForQuarter = allGradesData[`q${currentQuarter}`]; (dataForQuarter.section[subjectName] || []).forEach((task, index) => { if (currentTaskTab === 'section' && index === currentTaskIndex) return; const result = parseFloat(task.userResult); if (!isNaN(result)) { otherSorResult += result; otherSorMax += task.max; } }); (dataForQuarter.quarter[subjectName] || []).forEach((task, index) => { if (currentTaskTab === 'quarter' && index === currentTaskIndex) return; const result = parseFloat(task.userResult); if (!isNaN(result)) { otherSochResult += result; otherSochMax += task.max; } }); const currentTask = dataForQuarter[currentTaskTab][subjectName][currentTaskIndex]; const maxForCurrent = currentTask.max; for (let x = 0; x <= maxForCurrent; x++) { let potentialSorResult = otherSorResult, potentialSorMax = otherSorMax, potentialSochResult = otherSochResult, potentialSochMax = otherSochMax; if (currentTaskTab === 'section') { potentialSorResult += x; potentialSorMax += maxForCurrent; } else { potentialSochResult += x; potentialSochMax += maxForCurrent; } const potentialFinalPercentage = calculateFinalPercentage(potentialSorResult, potentialSorMax, potentialSochResult, potentialSochMax); if (potentialFinalPercentage >= targetPercentage) return x; } return 0; }
function handleInputChange(event) { const input = event.target; const subject = input.dataset.subject; const tab = input.dataset.tab; const index = parseInt(input.dataset.index, 10); const value = input.value; const dataForQuarter = allGradesData[`q${currentQuarter}`]; const match = value.match(/^%([345])$/); if (match) { const targetGrade = parseInt(match[1], 10); const requiredScore = calculateRequiredScore(targetGrade, subject, tab, index); input.value = requiredScore; dataForQuarter[tab][subject][index].userResult = requiredScore; } else { let numericValue = parseFloat(value); const max = dataForQuarter[tab][subject][index].max; if (numericValue > max) { numericValue = max; input.value = max; } dataForQuarter[tab][subject][index].userResult = (value === '' || isNaN(numericValue)) ? '' : numericValue; } calculateAndUpdateSubject(subject); saveData(); }
function handleMaxScoreChange(event) {
    const input = event.target;
    const subject = input.dataset.subject;
    const tab = input.dataset.tab;
    const index = parseInt(input.dataset.index, 10);
    let value = parseInt(input.value, 10);
    if (isNaN(value) || value < 1) {
        value = 1;
        input.value = value;
    }
    allGradesData[`q${currentQuarter}`][tab][subject][index].max = value;
    calculateAndUpdateSubject(subject);
    saveData();
}
function renderMainContent() {
    const contentDisplay = document.getElementById('content-display');
    const dataForQuarter = allGradesData[`q${currentQuarter}`];
    if (!dataForQuarter) { contentDisplay.innerHTML = `<div class="no-data-message">Данные для этой четверти еще не созданы.</div>`; return; }
    const data = dataForQuarter[currentTabId]?.[currentSubject];
    let tableHTML = `<div class="table-wrapper"><table><thead><tr><th></th><th>Наименование</th><th>Результат</th><th>Максимум</th></tr></thead><tbody>`;
    if (!data || data.length === 0) { contentDisplay.innerHTML = `<div class="no-data-message">Данные отсутствуют.</div>`; return; }
    
    data.forEach((item, index) => {
        const resultValue = (item.userResult !== null && item.userResult !== undefined && item.userResult !== '') ? item.userResult : '';
        tableHTML += `
            <tr>
                <td>${index + 1}</td>
                <td>${item.name}</td>
                <td><input type="text" value="${resultValue}" data-subject="${currentSubject}" data-tab="${currentTabId}" data-index="${index}"></td>
                <td><input type="number" class="max-score-input" value="${item.max}" data-subject="${currentSubject}" data-tab="${currentTabId}" data-index="${index}"></td>
            </tr>`;
    });
    
    tableHTML += `</tbody></table></div>`;
    contentDisplay.innerHTML = tableHTML;
    contentDisplay.querySelectorAll('input[type="text"]').forEach(input => {
        input.addEventListener('change', handleInputChange);
    });
    contentDisplay.querySelectorAll('.max-score-input').forEach(input => {
        input.addEventListener('change', handleMaxScoreChange);
    });
}
function renderSidebar() {
    const myGradesSidebarBody = document.getElementById('my-grades-sidebar-body');
    myGradesSidebarBody.innerHTML = '';
    const dataForQuarter = allGradesData[`q${currentQuarter}`];
    if (!dataForQuarter || !dataForQuarter.section) return;
    const subjects = Object.keys(dataForQuarter.section);
    subjects.forEach((subject, index) => {
        const row = document.createElement('tr');
        row.dataset.subject = subject;
        row.innerHTML = `<td>${index + 1}</td><td>${subject}</td><td class="subject-percentage">-- %</td><td class="subject-grade">-</td>`;
        myGradesSidebarBody.appendChild(row);
    });
    const selectedRow = myGradesSidebarBody.querySelector(`tr[data-subject="${currentSubject}"]`);
    if (selectedRow) selectedRow.classList.add('selected');
    myGradesSidebarBody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', function() {
            if (myGradesSidebarBody.querySelector('.selected')) {
                myGradesSidebarBody.querySelector('.selected').classList.remove('selected');
            }
            this.classList.add('selected');
            currentSubject = this.dataset.subject;
            renderMainContent();
        });
    });
}
function renderFriendData(friendData, container) {
    const friendGrades = friendData.grades || {};
    const friendProfile = friendData.profile;
    container.innerHTML = `
        <div class="friend-profile-header">
            <img src="${friendProfile.photoURL || 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'}" alt="Фото профиля ${friendProfile.username}">
            <div>
                <h3>Профиль: ${friendProfile.username}</h3>
                <p>Класс: ${friendProfile.class || 'Не указан'}</p>
            </div>
        </div>
        <div class="friend-data-section">
            <h4>Статистика</h4>
            <div class="quarter-selector" id="friend-stats-q-selector"><button class="q-btn active" data-quarter="1">1</button><button class="q-btn" data-quarter="2">2</button><button class="q-btn" data-quarter="3">3</button><button class="q-btn" data-quarter="4">4</button></div>
            <div id="friend-stats-results-container" class="stats-container" style="box-shadow: none; border: none; padding: 0;"></div>
        </div>
        <div class="friend-data-section">
            <h4>Оценки</h4>
            <div class="content-card wide" style="box-shadow: none; border: none; padding: 0;">
                <div class="sidebar table-wrapper"><table><thead><tr><th></th><th>Предмет</th><th>Общий %</th><th>Оценка</th></tr></thead><tbody id="friend-sidebar-body"></tbody></table></div>
                <div class="main-content">
                    <div class="quarter-selector" id="friend-grades-q-selector"><button class="q-btn active" data-quarter="1">1</button><button class="q-btn" data-quarter="2">2</button><button class="q-btn" data-quarter="3">3</button><button class="q-btn" data-quarter="4">4</button></div>
                    <div class="tabs" id="friend-tabs"><div class="tab active" data-tab-id="section">СОР</div><div class="tab" data-tab-id="quarter">СОЧ</div></div>
                    <div id="friend-content-display"></div>
                </div>
            </div>
        </div>`;
    let fq = 1, ft = 'section', fs = "Английский язык";
    const friendStatsQSelector = document.getElementById('friend-stats-q-selector'); const friendGradesQSelector = document.getElementById('friend-grades-q-selector'); const friendTabs = document.getElementById('friend-tabs');
    const renderFriendGradesView = () => { const sb = document.getElementById('friend-sidebar-body'); const cd = document.getElementById('friend-content-display'); const qd = friendGrades[`q${fq}`] || getNewQuarterData(); sb.innerHTML = ''; Object.keys(qd.section).forEach((s, i) => { const p = calculateFinalPercentageForFriend(s, qd); const g = getGradeFromPercentage(p); const r = document.createElement('tr'); r.dataset.subject = s; r.innerHTML = `<td>${i + 1}</td><td>${s}</td><td class="subject-percentage">${(p !== null && p >= 0) ? p.toFixed(2) + ' %' : '-- %'}</td><td class="subject-grade">${(p !== null && p >= 0) ? g : '-'}</td>`; if (s === fs) r.classList.add('selected'); sb.appendChild(r); }); const d = qd[ft]?.[fs]; let th = `<div class="table-wrapper"><table><thead><tr><th></th><th>Наименование</th><th>Результат</th><th>Максимум</th></tr></thead><tbody>`; if (d && d.length > 0) { d.forEach((i, x) => { th += `<tr><td>${x + 1}</td><td>${i.name}</td><td class="readonly-result">${i.userResult || '-'}</td><td class="max-col">${i.max}</td></tr>`; }); } th += `</tbody></table></div>`; cd.innerHTML = th; sb.querySelectorAll('tr').forEach(r => r.addEventListener('click', function() { fs = this.dataset.subject; renderFriendGradesView(); })); };
    const renderFriendDataViews = () => { renderStatisticsView('friend-stats-results-container', friendGrades, true); renderFriendGradesView(); };
    const handleFriendQSelector = (e) => { if (e.target.classList.contains('q-btn')) { fq = parseInt(e.target.dataset.quarter, 10); friendStatsQSelector.querySelector('.active').classList.remove('active'); friendGradesQSelector.querySelector('.active').classList.remove('active'); friendStatsQSelector.children[fq-1].classList.add('active'); friendGradesQSelector.children[fq-1].classList.add('active'); renderFriendDataViews(); }};
    friendStatsQSelector.addEventListener('click', handleFriendQSelector); friendGradesQSelector.addEventListener('click', handleFriendQSelector);
    friendTabs.addEventListener('click', e => { if (e.target.classList.contains('tab')) { friendTabs.querySelector('.active').classList.remove('active'); e.target.classList.add('active'); ft = e.target.dataset.tabId; renderFriendGradesView(); }});
    renderFriendDataViews();
}

function isQuarterComplete(quarter) {
    if (!quarter || !quarter.section) return false;
    for (const typeKey of ['section', 'quarter']) {
        const gradeType = quarter[typeKey];
        if (gradeType) {
            for (const subjectKey in gradeType) {
                const subject = gradeType[subjectKey];
                for (const task of subject) {
                    if (task.userResult === '' || task.userResult === null || task.userResult === undefined) {
                        return false;
                    }
                }
            }
        }
    }
    return true;
}

function userHasAllGrades(gradesData) {
    if (!gradesData || Object.keys(gradesData).length === 0) {
        return false;
    }
    let hasStartedAtLeastOneQuarter = false;
    for (const qKey in gradesData) {
        if (gradesData.hasOwnProperty(qKey)) {
            hasStartedAtLeastOneQuarter = true;
            if (!isQuarterComplete(gradesData[qKey])) {
                return false;
            }
        }
    }
    return hasStartedAtLeastOneQuarter;
}

// ЗАМЕНИТЕ СТАРУЮ ФУНКЦИЮ НА ЭТУ НОВУЮ
async function renderLeaderboard() {
    const container = document.getElementById('leaderboard-table-container');
    const filterEnabled = document.getElementById('leaderboard-filter-complete').checked;
    container.innerHTML = '<p>Загрузка данных...</p>';

    try {
        // Загружаем только публичные профили, используя запрос, разрешенный правилами
        const usersRef = db.ref('users');
        const snapshot = await usersRef.orderByChild('profile/isPublic').equalTo(true).once('value');
        
        if (!snapshot.exists()) {
            container.innerHTML = '<p>Нет публичных профилей для отображения.</p>'; 
            return;
        }

        let leaderboardData = [];
        snapshot.forEach(childSnapshot => {
            const user = childSnapshot.val();
            // Дополнительная проверка, хотя запрос уже должен был это сделать
            if (!user.profile || !user.profile.isPublic) {
                return;
            }

            if (filterEnabled && !userHasAllGrades(user.grades || {})) {
                return;
            }

            if (user.grades) {
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
            container.innerHTML = filterEnabled ? '<p>Нет пользователей, заполнивших все оценки.</p>' : '<p>Нет пользователей с введенными оценками.</p>';
            return;
        }

        leaderboardData.sort((a, b) => {
            if (currentLeaderboardSort === 'percentage') {
                return b.averagePercentage - a.averagePercentage;
            } else {
                return b.averageGrade - a.averageGrade;
            }
        });

        let tableHTML = `<div class="table-wrapper"><table class="leaderboard-table"><thead><tr><th class="rank-col">#</th><th>Пользователь</th><th class="number-col">Средний %</th><th class="number-col">Средняя оценка</th></tr></thead><tbody>`;
        leaderboardData.forEach((player, index) => {
            tableHTML += `<tr><td class="rank-col">${index + 1}</td><td>${player.username}</td><td class="number-col">${player.averagePercentage.toFixed(2)} %</td><td class="number-col">${player.averageGrade.toFixed(2)}</td></tr>`;
        });
        tableHTML += `</tbody></table></div>`;
        container.innerHTML = tableHTML;

    } catch (error) {
        console.error("Ошибка при загрузке лидерборда:", error);
        container.innerHTML = '<p>Не удалось загрузить данные. Попробуйте позже.</p>';
    }
}

function calculateOverallStats(gradesData) { const allPercentages = []; const allGrades = []; for (const quarterKey in gradesData) { if (gradesData.hasOwnProperty(quarterKey)) { const quarterData = gradesData[quarterKey]; if (quarterData && quarterData.section) { for (const subjectName in quarterData.section) { if (quarterData.section.hasOwnProperty(subjectName)) { const percentage = calculateFinalPercentageForFriend(subjectName, quarterData); if (percentage !== null && percentage >= 0) { allPercentages.push(percentage); allGrades.push(getGradeFromPercentage(percentage)); } } } } } } if (allPercentages.length === 0) { return { averagePercentage: 0, averageGrade: 0 }; } const avgPercentage = allPercentages.reduce((a, b) => a + b, 0) / allPercentages.length; const avgGrade = allGrades.reduce((a, b) => a + b, 0) / allGrades.length; return { averagePercentage: avgPercentage, averageGrade: avgGrade }; }
async function handlePostSubmit() {
    const postTextInput = document.getElementById('post-text-input');
    const isAnonymous = document.getElementById('post-anonymous-checkbox').checked;
    const text = postTextInput.value.trim();
    const submitBtn = document.getElementById('submit-post-btn');
    if (!text && !selectedPostFile) {
        alert('Нельзя отправить пустой пост.');
        return;
    }
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    let imageURL = null;
    if (selectedPostFile) {
        try {
            imageURL = await uploadToCloudinary(selectedPostFile);
        } catch (error) {
            console.error(error);
            alert('Не удалось загрузить изображение.');
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            return;
        }
    }
    const postData = {
        uid: currentUser.uid,
        username: isAnonymous ? 'Аноним' : userProfile.username,
        text: text,
        isAnonymous: isAnonymous,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        authorPhotoURL: isAnonymous ? 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png' : (userProfile.photoURL || 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png')
    };
    if (imageURL) {
        postData.imageURL = imageURL;
    }
    db.ref('posts').push(postData)
        .then(() => {
            postTextInput.value = '';
            document.getElementById('post-anonymous-checkbox').checked = false;
            removeSelectedPostImage();
        })
        .catch(error => {
            console.error("Ошибка при отправке поста:", error);
            alert("Не удалось отправить пост.");
        })
        .finally(() => {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        });
}
function handleDeletePost(postId) { db.ref('posts/' + postId).remove().catch(error => { console.error("Ошибка при удалении поста:", error); alert("Не удалось удалить пост. У вас может не быть прав на это действие."); }); }
function formatTimestamp(ts) { const date = new Date(ts); return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function renderChatView() {
    const postsContainer = document.getElementById('posts-container');
    postsRef = db.ref('posts').orderByChild('timestamp').limitToLast(100);
    postsListener = (snapshot) => {
        postsContainer.innerHTML = '';
        if (!snapshot.exists()) {
            postsContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Здесь пока нет постов. Будьте первым!</p>';
            return;
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
            const deleteButtonHtml = post.uid === currentUser.uid ? `<button class="post-delete-btn" data-post-id="${post.id}">&times;</button>` : '';
            const postImageHtml = post.imageURL ? `<img src="${post.imageURL}" class="post-image" alt="Прикрепленное изображение">` : '';
            postsHtml += `
                <div class="post-card">
                    ${deleteButtonHtml}
                    <div class="post-header">
                        <img src="${post.authorPhotoURL || 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'}" class="post-avatar">
                        <div class="post-author-info">
                            ${authorHtml}
                            <span class="post-timestamp">${formatTimestamp(post.timestamp)}</span>
                        </div>
                    </div>
                    ${post.text ? `<p class="post-body">${post.text}</p>` : ''}
                    ${postImageHtml}
                </div>
            `;
        });
        postsContainer.innerHTML = postsHtml;
    };
    postsRef.on('value', postsListener, (error) => {
        console.error("Ошибка при загрузке постов:", error);
        postsContainer.innerHTML = '<p>Не удалось загрузить посты.</p>';
    });
}
async function uploadToCloudinary(file) {
    const CLOUD_NAME = "dqj6o60sc";
    const UPLOAD_PRESET = "ml_default";
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) {
        throw new Error('Ошибка при загрузке изображения в Cloudinary.');
    }
    const data = await response.json();
    return data.secure_url;
}
async function handleProfilePictureUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите файл изображения.'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert('Файл слишком большой. Максимальный размер - 5 МБ.'); return;
    }
    const profilePictureContainer = document.getElementById('profile-picture-container');
    const profilePictureImg = document.getElementById('profile-picture-img');
    
    profilePictureContainer.classList.add('loading');
    try {
        const downloadURL = await uploadToCloudinary(file);
        await db.ref(`users/${currentUser.uid}/profile/photoURL`).set(downloadURL);
        profilePictureImg.src = downloadURL;
        userProfile.photoURL = downloadURL;
    } catch (error) {
        console.error('Ошибка загрузки фото:', error);
        alert('Не удалось загрузить фото. Попробуйте снова.');
    } finally {
        profilePictureContainer.classList.remove('loading');
    }
}
function handleUsernameClick(username) { navigateTo('users'); document.getElementById('search-username-input').value = username; searchAndDisplayUser(username); }
function handlePostImageSelection(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите файл изображения.'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert('Файл слишком большой. Максимальный размер - 5 МБ.'); return;
    }
    selectedPostFile = file;
    const previewContainer = document.getElementById('post-image-preview-container');
    const previewImage = document.getElementById('post-image-preview');
    const reader = new FileReader();
    reader.onload = (event) => {
        previewImage.src = event.target.result;
        previewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}
function removeSelectedPostImage() {
    selectedPostFile = null;
    document.getElementById('post-image-input').value = '';
    document.getElementById('post-image-preview-container').classList.add('hidden');
    document.getElementById('post-image-preview').src = '#';
}

// --- НОВЫЕ ФУНКЦИИ ДЛЯ АДМИН ПАНЕЛИ ---

function renderAdminPanel() {
    switchAdminTab('users');
}

function switchAdminTab(tabName) {
    document.querySelector('.admin-tab.active').classList.remove('active');
    document.getElementById(`admin-tab-${tabName}`).classList.add('active');
    
    const container = document.getElementById('admin-content-container');
    container.innerHTML = '<p>Загрузка данных...</p>';

    if (tabName === 'users') {
        renderAdminUsersTab();
    } else if (tabName === 'posts') {
        renderAdminPostsTab();
    }
}

async function renderAdminUsersTab() {
    const container = document.getElementById('admin-content-container');
    container.innerHTML = '<p>Загрузка списка пользователей...</p>';

    try {
        const usernamesSnapshot = await db.ref('usernames').once('value');
        if (!usernamesSnapshot.exists()) {
            container.innerHTML = '<p>Пользователи не найдены.</p>';
            return;
        }
        const usernames = usernamesSnapshot.val();
        const uidsToFetch = Object.values(usernames);

        const userPromises = uidsToFetch.map(uid => db.ref('users/' + uid).once('value'));
        const userSnapshots = await Promise.all(userPromises);

        allUsersDataCache = {};
        userSnapshots.forEach(snapshot => {
            if (snapshot.exists()) {
                allUsersDataCache[snapshot.key] = snapshot.val();
            }
        });

        if (Object.keys(allUsersDataCache).length === 0) {
             container.innerHTML = '<p>Не удалось загрузить данные профилей.</p>';
             return;
        }

        let usersHtml = '';
        for (const uid in allUsersDataCache) {
            const user = allUsersDataCache[uid];
            if (!user.profile) continue;

            usersHtml += `
                <div class="admin-user-card" id="admin-user-${uid}">
                    <div id="user-display-${uid}">
                        <div class="admin-user-info">
                            <img src="${user.profile.photoURL || 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'}" alt="Фото профиля">
                            <div class="admin-user-details">
                                <p><strong>Имя:</strong> ${user.profile.username}</p>
                                <p><strong>Класс:</strong> ${user.profile.class}</p>
                                <p class="email-info"><strong>Email:</strong> ${user.profile.email}</p>
                                <p class="password-warning"><strong>Пароль:</strong> Недоступен для просмотра из соображений безопасности.</p>
                            </div>
                        </div>
                        <div class="admin-user-actions">
                            <button class="button" onclick="toggleAdminUserEdit('${uid}')">Изменить</button>
                            <button class="button" onclick="renderAdminGradeEditor('${uid}', this)">Оценки</button>
                            <button class="button secondary" onclick="deleteAdminUser('${uid}', '${user.profile.username}')">Удалить</button>
                        </div>
                    </div>
                    <div id="user-edit-${uid}" class="hidden">
                        <p><strong>Редактирование пользователя: ${user.profile.username}</strong></p>
                        <input type="text" id="edit-username-${uid}" value="${user.profile.username}" placeholder="Имя пользователя">
                        <input type="text" id="edit-class-${uid}" value="${user.profile.class}" placeholder="Класс">
                        <div class="admin-edit-actions">
                            <button class="button" onclick="saveAdminUser('${uid}', '${user.profile.username}')">Сохранить</button>
                            <button class="button secondary" onclick="toggleAdminUserEdit('${uid}')">Отмена</button>
                        </div>
                    </div>
                    <div id="grades-editor-${uid}" class="admin-grade-editor-container hidden">
                    </div>
                </div>
            `;
        }
        container.innerHTML = usersHtml;
    } catch (error) {
        console.error("Ошибка при загрузке пользователей:", error);
        container.innerHTML = `<p>Не удалось загрузить пользователей. Ошибка: ${error.message}</p>`;
    }
}

function toggleAdminUserEdit(uid) {
    document.getElementById(`user-display-${uid}`).classList.toggle('hidden');
    document.getElementById(`user-edit-${uid}`).classList.toggle('hidden');
}

async function saveAdminUser(uid, oldUsername) {
    const newUsername = document.getElementById(`edit-username-${uid}`).value.trim();
    const newClass = document.getElementById(`edit-class-${uid}`).value.trim();

    if (!newUsername || !newClass) {
        alert("Имя и класс не могут быть пустыми.");
        return;
    }

    const updates = {};
    updates[`/users/${uid}/profile/username`] = newUsername;
    updates[`/users/${uid}/profile/class`] = newClass;
    updates[`/usernames/${oldUsername.toLowerCase()}`] = null;
    updates[`/usernames/${newUsername.toLowerCase()}`] = uid;

    try {
        await db.ref().update(updates);
        alert("Данные пользователя обновлены.");
        renderAdminUsersTab();
    } catch (error) {
        console.error("Ошибка при сохранении данных пользователя:", error);
        alert("Не удалось сохранить данные.");
    }
}

function deleteAdminUser(uid, username) {
    if (!confirm(`Вы уверены, что хотите удалить пользователя ${username}? Это действие необратимо.`)) {
        return;
    }

    const updates = {};
    updates[`/users/${uid}`] = null;
    updates[`/usernames/${username.toLowerCase()}`] = null;

    db.ref().update(updates)
        .then(() => {
            alert(`Пользователь ${username} удален.`);
            document.getElementById(`admin-user-${uid}`).remove();
        })
        .catch(error => {
            console.error("Ошибка при удалении пользователя:", error);
            alert("Не удалось удалить пользователя.");
        });
}

function renderAdminGradeEditor(uid, button) {
    const container = document.getElementById(`grades-editor-${uid}`);
    const isHidden = container.classList.contains('hidden');

    document.querySelectorAll('.admin-grade-editor-container').forEach(el => {
        if (el.id !== `grades-editor-${uid}`) {
            el.classList.add('hidden');
            el.innerHTML = '';
        }
    });
    document.querySelectorAll('.admin-user-actions .button').forEach(btn => { 
        if (btn !== button && btn.textContent === 'Скрыть оценки') {
            btn.textContent = 'Оценки';
        }
    });

    if (isHidden) {
        container.classList.remove('hidden');
        button.textContent = 'Скрыть оценки';
        renderAdminGradeInterface(uid, container); 
    } else {
        container.classList.add('hidden');
        container.innerHTML = '';
        button.textContent = 'Оценки';
    }
}

function renderAdminGradeInterface(uid, container) {
    container.innerHTML = `
        <h4>Редактор оценок для: ${allUsersDataCache[uid].profile.username}</h4>
        <div class="quarter-selector" id="admin-q-selector-${uid}">
            <button class="q-btn active" data-quarter="1">1</button>
            <button class="q-btn" data-quarter="2">2</button>
            <button class="q-btn" data-quarter="3">3</button>
            <button class="q-btn" data-quarter="4">4</button>
        </div>
        <div class="content-card wide" style="box-shadow: none; border: none; padding: 0;">
            <div class="sidebar table-wrapper">
                <table>
                    <thead><tr><th>Предмет</th><th>Общий %</th><th>Оценка</th></tr></thead>
                    <tbody id="admin-sidebar-body-${uid}"></tbody>
                </table>
            </div>
            <div class="main-content" id="admin-main-content-${uid}">
            </div>
        </div>
    `;

    renderAdminGradesForQuarter(uid, 1);

    document.getElementById(`admin-q-selector-${uid}`).addEventListener('click', (e) => {
        if (e.target.classList.contains('q-btn')) {
            const quarter = parseInt(e.target.dataset.quarter, 10);
            document.querySelector(`#admin-q-selector-${uid} .q-btn.active`).classList.remove('active');
            e.target.classList.add('active');
            renderAdminGradesForQuarter(uid, quarter);
        }
    });
}

function renderAdminGradesForQuarter(uid, quarter) {
    const userGrades = allUsersDataCache[uid].grades || {};
    let quarterData = userGrades[`q${quarter}`];
    
    if (!quarterData) {
        quarterData = getNewQuarterData();
        if (!allUsersDataCache[uid].grades) allUsersDataCache[uid].grades = {};
        allUsersDataCache[uid].grades[`q${quarter}`] = quarterData;
    }

    const sidebarBody = document.getElementById(`admin-sidebar-body-${uid}`);
    const mainContent = document.getElementById(`admin-main-content-${uid}`);
    let selectedSubject = Object.keys(quarterData.section)[0];

    const calculateAdminSubject = (subjectName) => {
        const p = calculateFinalPercentageForFriend(subjectName, quarterData);
        const g = getGradeFromPercentage(p);
        const row = sidebarBody.querySelector(`tr[data-subject="${subjectName}"]`);
        if(row) {
            row.querySelector('.subject-percentage').textContent = (p !== null && p >= 0) ? p.toFixed(2) + ' %' : '-- %';
            row.querySelector('.subject-grade').textContent = (p !== null && p >= 0) ? g : '-';
        }
    };

    const renderMainAdminContent = () => {
        const tabsHtml = `
            <div class="tabs" id="admin-tabs-${uid}-${quarter}">
                <div class="tab active" data-tab-id="section">СОР</div>
                <div class="tab" data-tab-id="quarter">СОЧ</div>
            </div>
            <div id="admin-content-display-${uid}-${quarter}"></div>`;
        mainContent.innerHTML = tabsHtml;

        const renderTabContent = (tabId) => {
            const contentDisplay = document.getElementById(`admin-content-display-${uid}-${quarter}`);
            const data = quarterData[tabId]?.[selectedSubject] || [];
            let tableHTML = `<div class="table-wrapper"><table><thead><tr><th>Наименование</th><th>Результат</th><th>Максимум</th></tr></thead><tbody>`;
            if (data.length > 0) {
                data.forEach((item, index) => {
                    tableHTML += `
                        <tr>
                            <td>${item.name}</td>
                            <td><input type="text" value="${item.userResult || ''}" data-tab="${tabId}" data-index="${index}"></td>
                            <td><input type="number" class="max-score-input" value="${item.max}" data-tab="${tabId}" data-index="${index}"></td>
                        </tr>`;
                });
            }
            tableHTML += `</tbody></table></div><button class="button" style="margin-top: 15px;">Сохранить оценки</button>`;
            contentDisplay.innerHTML = tableHTML;

            contentDisplay.querySelector('.button').addEventListener('click', () => {
                db.ref(`users/${uid}/grades`).set(allUsersDataCache[uid].grades)
                  .then(() => alert(`Оценки для ${allUsersDataCache[uid].profile.username} сохранены!`))
                  .catch(err => alert('Ошибка при сохранении: ' + err.message));
            });

            contentDisplay.querySelectorAll('input').forEach(input => {
                input.addEventListener('change', (e) => {
                    const tab = e.target.dataset.tab;
                    const index = parseInt(e.target.dataset.index, 10);
                    const value = e.target.value;
                    if (e.target.classList.contains('max-score-input')) {
                        quarterData[tab][selectedSubject][index].max = parseInt(value, 10) || 0;
                    } else {
                        quarterData[tab][selectedSubject][index].userResult = value;
                    }
                    calculateAdminSubject(selectedSubject);
                });
            });
        };

        document.getElementById(`admin-tabs-${uid}-${quarter}`).addEventListener('click', (e) => {
            if (e.target.classList.contains('tab')) {
                document.querySelector(`#admin-tabs-${uid}-${quarter} .tab.active`).classList.remove('active');
                e.target.classList.add('active');
                renderTabContent(e.target.dataset.tabId);
            }
        });

        renderTabContent('section');
    };

    sidebarBody.innerHTML = '';
    Object.keys(quarterData.section).forEach(subject => {
        const row = document.createElement('tr');
        row.dataset.subject = subject;
        row.innerHTML = `<td>${subject}</td><td class="subject-percentage">-- %</td><td class="subject-grade">-</td>`;
        sidebarBody.appendChild(row);
        calculateAdminSubject(subject);
    });

    sidebarBody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', function() {
            if (sidebarBody.querySelector('.selected')) {
                sidebarBody.querySelector('.selected').classList.remove('selected');
            }
            this.classList.add('selected');
            selectedSubject = this.dataset.subject;
            renderMainAdminContent();
        });
    });

    if (sidebarBody.querySelector('tr')) {
        sidebarBody.querySelector('tr').classList.add('selected');
    }
    renderMainAdminContent();
}

async function renderAdminPostsTab() {
    const container = document.getElementById('admin-content-container');
    container.innerHTML = '<p>Загрузка постов...</p>';
    try {
        if (!allUsersDataCache) {
             await renderAdminUsersTab(); // Убедимся, что кеш пользователей загружен
             container.innerHTML = '<p>Загрузка постов...</p>'; // Возвращаем сообщение о загрузке
        }

        const postsSnapshot = await db.ref('posts').orderByChild('timestamp').once('value');
        if (!postsSnapshot.exists()) {
            container.innerHTML = '<p>Постов нет.</p>';
            return;
        }

        const postsData = [];
        postsSnapshot.forEach(child => {
            postsData.push({ id: child.key, ...child.val() });
        });
        postsData.reverse();

        let postsHtml = '';
        postsData.forEach(post => {
            const authorProfile = allUsersDataCache[post.uid]?.profile;
            const realUsername = authorProfile ? authorProfile.username : 'Неизвестный пользователь';
            const authorPhoto = authorProfile ? authorProfile.photoURL : 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png';
            
            let authorInfo = `<strong>${post.username}</strong>`;
            if (post.isAnonymous) {
                authorInfo += ` <span class="admin-post-author-reveal">(настоящий автор: ${realUsername})</span>`;
            }

            postsHtml += `
                <div class="admin-post-card">
                    <div class="post-header">
                         <img src="${authorPhoto || 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'}" class="post-avatar">
                         <div class="post-author-info">
                            ${authorInfo}
                            <span class="post-timestamp">${formatTimestamp(post.timestamp)}</span>
                         </div>
                    </div>
                    ${post.text ? `<p class="post-body">${post.text}</p>` : ''}
                    ${post.imageURL ? `<img src="${post.imageURL}" class="post-image" alt="Прикрепленное изображение" style="max-width: 200px;">` : ''}
                    <div class="admin-user-actions">
                        <button class="button secondary" onclick="adminDeletePost('${post.id}', this)">Удалить пост</button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = postsHtml;
    } catch (error) {
        console.error("Ошибка при загрузке постов:", error);
        container.innerHTML = '<p>Не удалось загрузить посты.</p>';
    }
}

function adminDeletePost(postId, button) {
    if (!confirm("Вы уверены, что хотите удалить этот пост?")) return;
    db.ref('posts/' + postId).remove()
        .then(() => {
            alert("Пост удален.");
            button.closest('.admin-post-card').remove();
        })
        .catch(error => {
            console.error("Ошибка при удалении поста:", error);
            alert("Не удалось удалить пост.");
        });
}
