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
let postsViewedInSession = {};
let currentForumCategory = 'chat'; // 'chat' или 'homework'
let adminUsersListeners = {}; // Для отслеживания lastSeen в админ панели
let currentAdminPostsCategory = 'chat'; // Для админ панели постов

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
            
            // Обновляем время последней активности
            updateUserLastSeen();
            // Устанавливаем интервал для обновления каждые 30 секунд
            setInterval(updateUserLastSeen, 30000);
            
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
    
    // Обработчик выбора четверти в лидерборде
    document.getElementById('leaderboard-quarter-selector').addEventListener('click', (e) => {
        if (e.target.classList.contains('q-btn')) {
            document.querySelector('#leaderboard-quarter-selector .q-btn.active').classList.remove('active');
            e.target.classList.add('active');
            currentLeaderboardQuarter = e.target.dataset.quarter;
            renderLeaderboard();
        }
    });

    profilePictureContainer.addEventListener('click', () => profilePictureInput.click());
    profilePictureInput.addEventListener('change', handleProfilePictureUpload);
    
    attachPhotoButton.addEventListener('click', () => postImageInput.click());
    postImageInput.addEventListener('change', handlePostImageSelection);
    removePostImageButton.addEventListener('click', removeSelectedPostImage);
    
    document.getElementById('submit-post-btn').addEventListener('click', handlePostSubmit);
    
    // Обработчик переключения категорий форума
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('forum-category-btn')) {
            const category = e.target.dataset.category;
            document.querySelectorAll('.forum-category-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentForumCategory = category;
            renderChatView();
        }
    });

    postsContainer.addEventListener('click', (e) => {
        const replyDeleteButton = e.target.closest('.reply-delete-btn');
        if (replyDeleteButton) {
            const postId = replyDeleteButton.dataset.postId;
            const replyId = replyDeleteButton.dataset.replyId;
            if (confirm('Вы уверены, что хотите удалить этот ответ?')) { handleDeleteReply(postId, replyId); }
            return;
        }
        const replyLikeButton = e.target.closest('.reply-like-btn');
        if (replyLikeButton) {
            const postId = replyLikeButton.dataset.postId;
            const replyId = replyLikeButton.dataset.replyId;
            handleReplyLikeToggle(postId, replyId);
            return;
        }
        const deleteButton = e.target.closest('.post-delete-btn');
        if (deleteButton) {
            const postId = deleteButton.dataset.postId;
            if (confirm('Вы уверены, что хотите удалить этот пост?')) { handleDeletePost(postId); }
            return;
        }
        const likeButton = e.target.closest('.like-btn');
        if (likeButton) {
            const postId = likeButton.dataset.postId;
            handleLikeToggle(postId);
            return;
        }
        const usernameSpan = e.target.closest('.clickable-username');
        if (usernameSpan) {
            const username = usernameSpan.dataset.username;
            if (username) { handleUsernameClick(username); }
            return;
        }
        const postImage = e.target.closest('.post-image');
        if (postImage) {
            window.open(postImage.src, '_blank');
            return;
        }
        const replyToggleButton = e.target.closest('.reply-toggle-btn');
        if (replyToggleButton) {
            const postId = replyToggleButton.dataset.postId;
            document.getElementById(`reply-form-${postId}`).classList.toggle('hidden');
            return;
        }
        const replySubmitButton = e.target.closest('.reply-submit-btn');
        if (replySubmitButton) {
            const postId = replySubmitButton.dataset.postId;
            handleReplySubmit(postId);
            return;
        }
    });

    document.getElementById('admin-tab-users').addEventListener('click', () => switchAdminTab('users'));
    document.getElementById('admin-tab-posts').addEventListener('click', () => switchAdminTab('posts'));
    document.getElementById('admin-tab-prefixes').addEventListener('click', () => switchAdminTab('prefixes'));
    document.getElementById('admin-tab-messages').addEventListener('click', () => switchAdminTab('messages'));
});

// --- КОД ФУНКЦИЙ ---

// НОВАЯ ГЛОБАЛЬНАЯ ФУНКЦИЯ для генерации HTML префиксов
function generatePrefixesHtml(prefixes) {
    if (!prefixes || !Array.isArray(prefixes) || prefixes.length === 0) {
        return '';
    }
    return prefixes.map(url => `<img src="${url}" class="nickname-prefix" alt="prefix">`).join('');
}

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
function updateUserLastSeen() {
    if (!currentUser) return;
    db.ref(`users/${currentUser.uid}/lastSeen`).set(firebase.database.ServerValue.TIMESTAMP);
}
function formatLastSeen(timestamp) {
    if (!timestamp) return 'Никогда';
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Только что';
    if (minutes < 60) return `${minutes} ${minutes === 1 ? 'минуту' : minutes < 5 ? 'минуты' : 'минут'} назад`;
    if (hours < 24) return `${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'} назад`;
    if (days < 7) return `${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} назад`;
    
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
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
            // Обновляем отображение имени пользователя с префиксами
            userDisplayNameElement.innerHTML = `Пользователь: ${userProfile.username || '...'} ${generatePrefixesHtml(userProfile.prefixes)}`;
            profileUsername.innerHTML = `${userProfile.username || 'Имя не указано'} ${generatePrefixesHtml(userProfile.prefixes)}`;
            profileClass.textContent = `Класс: ${userProfile.class || 'Не указан'}`;
            privacyCheckbox.checked = userProfile.isPublic === true;
            if (userProfile.photoURL) {
                profilePictureImg.src = userProfile.photoURL;
            } else {
                profilePictureImg.src = 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png';
            }

            const adminNavButton = document.getElementById('nav-admin');
            currentUser.getIdTokenResult().then(idTokenResult => {
                const isAdmin = !!idTokenResult.claims.admin;
                userProfile.isAdmin = isAdmin;
                if (isAdmin) {
                    adminNavButton.classList.remove('hidden');
                } else {
                    adminNavButton.classList.add('hidden');
                }
                if (!allGradesData[`q${currentQuarter}`]) { allGradesData[`q${currentQuarter}`] = getNewQuarterData(); }
                renderApp();
                renderProfileDashboard();
                checkForAnnouncements(); // Проверяем сообщения после загрузки
                resolve();
            });
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
    // Сбрасываем просмотренные посты только при выходе из форума
    if (viewName !== 'chat') {
        postsViewedInSession = {};
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
    if (viewName === 'users') { renderUsersView(); }
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

let allUsersByClass = {};

async function renderUsersView() {
    const classesContainer = document.getElementById('classes-container');
    const usersListContainer = document.getElementById('users-list-container');
    
    classesContainer.innerHTML = '<p>Загрузка пользователей...</p>';
    
    try {
        // Загружаем только публичных пользователей через правильный запрос
        const usersRef = db.ref('users');
        const publicUsersSnapshot = await usersRef.orderByChild('profile/isPublic').equalTo(true).once('value');
        
        // Также загружаем свой собственный профиль, если он приватный
        let ownProfile = null;
        if (currentUser) {
            try {
                const ownSnapshot = await db.ref(`users/${currentUser.uid}`).once('value');
                if (ownSnapshot.exists()) {
                    ownProfile = { uid: currentUser.uid, ...ownSnapshot.val() };
                }
            } catch (e) {
                // Игнорируем ошибки при загрузке собственного профиля
            }
        }
        
        // Группируем пользователей по классам
        allUsersByClass = {};
        const classOrder = ['7a', '7b', '7c', '7d', '7e', '7f', '7g', '7h', '7i', '7j'];
        
        // Создаем Set для отслеживания уже добавленных UID
        const addedUids = new Set();
        
        // Добавляем публичных пользователей
        if (publicUsersSnapshot.exists()) {
            publicUsersSnapshot.forEach(childSnapshot => {
                const user = childSnapshot.val();
                if (!user.profile || !user.profile.class) return;
                
                const userClass = user.profile.class.toLowerCase().trim();
                const uid = childSnapshot.key;
                
                // Проверяем, не добавлен ли уже этот пользователь
                if (!addedUids.has(uid)) {
                    if (!allUsersByClass[userClass]) {
                        allUsersByClass[userClass] = [];
                    }
                    allUsersByClass[userClass].push({
                        uid: uid,
                        ...user
                    });
                    addedUids.add(uid);
                }
            });
        }
        
        // Добавляем свой профиль, если он еще не добавлен (независимо от того, публичный он или приватный)
        if (ownProfile && ownProfile.profile && ownProfile.profile.class) {
            const userClass = ownProfile.profile.class.toLowerCase().trim();
            if (!addedUids.has(ownProfile.uid)) {
                if (!allUsersByClass[userClass]) {
                    allUsersByClass[userClass] = [];
                }
                allUsersByClass[userClass].push(ownProfile);
                addedUids.add(ownProfile.uid);
            }
        }
        
        // Сортируем пользователей в каждом классе по имени
        Object.keys(allUsersByClass).forEach(className => {
            allUsersByClass[className].sort((a, b) => 
                (a.profile.username || '').localeCompare(b.profile.username || '')
            );
        });
        
        // Отображаем классы
        let classesHtml = '';
        classOrder.forEach(className => {
            const count = allUsersByClass[className] ? allUsersByClass[className].length : 0;
            classesHtml += `
                <div class="class-card" data-class="${className}">
                    <div class="class-name">${className.toUpperCase()}</div>
                    <div class="class-count">${count} ${count === 1 ? 'человек' : count < 5 ? 'человека' : 'человек'}</div>
                </div>
            `;
        });
        
        classesContainer.innerHTML = classesHtml;
        
        // Добавляем обработчики кликов на классы
        classesContainer.querySelectorAll('.class-card').forEach(card => {
            card.addEventListener('click', () => {
                const selectedClass = card.dataset.class;
                document.querySelectorAll('.class-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                renderUsersForClass(selectedClass);
            });
        });
        
        usersListContainer.classList.add('hidden');
        
    } catch (error) {
        console.error("Ошибка при загрузке пользователей:", error);
        classesContainer.innerHTML = '<p>Не удалось загрузить пользователей.</p>';
    }
}

function renderUsersForClass(className) {
    const usersListContainer = document.getElementById('users-list-container');
    const users = allUsersByClass[className] || [];
    
    if (users.length === 0) {
        usersListContainer.innerHTML = '<p>В этом классе нет пользователей.</p>';
        usersListContainer.classList.remove('hidden');
        return;
    }
    
    let usersHtml = `
        <div class="users-list-header">
            <h4>Пользователи класса ${className.toUpperCase()}</h4>
            <button class="button secondary" onclick="document.getElementById('users-list-container').classList.add('hidden'); document.querySelectorAll('.class-card').forEach(c => c.classList.remove('active'));">Скрыть</button>
        </div>
        <div class="users-grid">
    `;
    
    users.forEach(user => {
        const photoURL = user.profile.photoURL || 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png';
        const prefixesHtml = generatePrefixesHtml(user.profile.prefixes || []);
        usersHtml += `
            <div class="user-card" data-uid="${user.uid}" data-username="${user.profile.username}">
                <img src="${photoURL}" alt="${user.profile.username}">
                <div class="user-card-info">
                    <div class="user-card-name">${user.profile.username} ${prefixesHtml}</div>
                    <div class="user-card-class">${user.profile.class}</div>
                </div>
            </div>
        `;
    });
    
    usersHtml += '</div>';
    usersListContainer.innerHTML = usersHtml;
    usersListContainer.classList.remove('hidden');
    
    // Добавляем обработчики кликов на пользователей
    usersListContainer.querySelectorAll('.user-card').forEach(card => {
        card.addEventListener('click', () => {
            const uid = card.dataset.uid;
            const username = card.dataset.username;
            handleUserCardClick(uid, username);
        });
    });
}

async function handleUserCardClick(uid, username) {
    const resultsContainer = document.getElementById('friend-results-container');
    resultsContainer.innerHTML = '<p class="no-data-message">Загрузка...</p>';
    
    try {
        const userSnapshot = await db.ref(`users/${uid}`).once('value');
        if (!userSnapshot.exists()) {
            resultsContainer.innerHTML = '<p class="no-data-message">Пользователь не найден.</p>';
            return;
        }
        
        const friendData = userSnapshot.val();
        if (!friendData || !friendData.profile) {
            resultsContainer.innerHTML = '<p class="no-data-message">Данные пользователя не найдены.</p>';
            return;
        }
        
        // Проверяем приватность профиля
        if (!friendData.profile.isPublic) {
            resultsContainer.innerHTML = '<p class="no-data-message">Этот аккаунт приватный. Вы не можете просматривать его данные.</p>';
            return;
        }
        
        // Если профиль публичный, показываем данные
        renderFriendData(friendData, resultsContainer);
        
        // Прокручиваем к результатам поиска
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
    } catch (error) {
        console.error("Ошибка при загрузке данных пользователя:", error);
        resultsContainer.innerHTML = '<p class="no-data-message">Не удалось загрузить данные пользователя.</p>';
    }
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
                <h3>Профиль: ${friendProfile.username} ${generatePrefixesHtml(friendProfile.prefixes)}</h3>
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
                if (Array.isArray(subject)) {
                    for (const task of subject) {
                        const result = task.userResult;
                        // Проверяем, что результат заполнен (не пустая строка, не null, не undefined)
                        // 0 - это валидное значение, поэтому не проверяем его
                        if (result === '' || result === null || result === undefined) {
                            return false;
                        }
                    }
                }
            }
        }
    }
    return true;
}

function userHasAllGrades(gradesData, selectedQuarter = null) {
    if (!gradesData || Object.keys(gradesData).length === 0) {
        return false;
    }
    
    // Если выбрана конкретная четверть, проверяем только её
    if (selectedQuarter !== null) {
        const qKey = `q${selectedQuarter}`;
        if (gradesData.hasOwnProperty(qKey) && gradesData[qKey]) {
            const quarter = gradesData[qKey];
            const hasAnyData = quarter.section && Object.keys(quarter.section).length > 0;
            if (hasAnyData) {
                return isQuarterComplete(quarter);
            }
        }
        return false;
    }
    
    // Если четверть не выбрана, проверяем все существующие четверти
    // Пользователь проходит фильтр, если хотя бы одна четверть полностью заполнена
    const quarters = ['q1', 'q2', 'q3', 'q4'];
    let hasAtLeastOneCompleteQuarter = false;
    
    for (const qKey of quarters) {
        if (gradesData.hasOwnProperty(qKey) && gradesData[qKey]) {
            const quarter = gradesData[qKey];
            const hasAnyData = quarter.section && Object.keys(quarter.section).length > 0;
            
            if (hasAnyData && isQuarterComplete(quarter)) {
                hasAtLeastOneCompleteQuarter = true;
                break; // Достаточно одной полностью заполненной четверти
            }
        }
    }
    
    return hasAtLeastOneCompleteQuarter;
}

async function renderLeaderboard() {
    const container = document.getElementById('leaderboard-table-container');
    const filterEnabled = document.getElementById('leaderboard-filter-complete').checked;
    const selectedQuarter = currentLeaderboardQuarter === 'all' ? null : parseInt(currentLeaderboardQuarter, 10);
    container.innerHTML = '<p>Загрузка данных...</p>';

    try {
        const usersRef = db.ref('users');
        const snapshot = await usersRef.orderByChild('profile/isPublic').equalTo(true).once('value');
        
        if (!snapshot.exists()) {
            container.innerHTML = '<p>Нет публичных профилей для отображения.</p>'; 
            return;
        }

        let leaderboardData = [];
        snapshot.forEach(childSnapshot => {
            const user = childSnapshot.val();
            if (!user.profile || !user.profile.isPublic) {
                return;
            }

            // Проверяем фильтр с учетом выбранной четверти
            if (filterEnabled && !userHasAllGrades(user.grades || {}, selectedQuarter)) {
                return;
            }

            if (user.grades) {
                const stats = calculateOverallStats(user.grades, selectedQuarter);
                if (stats.averagePercentage > 0) { 
                    leaderboardData.push({
                        username: user.profile.username,
                        prefixes: user.profile.prefixes || [],
                        averagePercentage: stats.averagePercentage,
                        averageGrade: stats.averageGrade
                    });
                }
            }
        });

        if (leaderboardData.length === 0) {
            const quarterText = selectedQuarter ? ` за ${selectedQuarter} четверть` : '';
            container.innerHTML = filterEnabled ? `<p>Нет пользователей, заполнивших все оценки${quarterText}.</p>` : `<p>Нет пользователей с введенными оценками${quarterText}.</p>`;
            return;
        }

        leaderboardData.sort((a, b) => {
            if (currentLeaderboardSort === 'percentage') {
                return b.averagePercentage - a.averagePercentage;
            } else {
                return b.averageGrade - a.averageGrade;
            }
        });

        const quarterText = selectedQuarter ? ` (${selectedQuarter} четверть)` : '';
        let tableHTML = `<div class="table-wrapper"><table class="leaderboard-table"><thead><tr><th class="rank-col">#</th><th>Пользователь</th><th class="number-col">Средний %</th><th class="number-col">Средняя оценка</th></tr></thead><tbody>`;
        leaderboardData.forEach((player, index) => {
            tableHTML += `<tr><td class="rank-col">${index + 1}</td><td>${player.username} ${generatePrefixesHtml(player.prefixes)}</td><td class="number-col">${player.averagePercentage.toFixed(2)} %</td><td class="number-col">${player.averageGrade.toFixed(2)}</td></tr>`;
        });
        tableHTML += `</tbody></table></div>`;
        container.innerHTML = tableHTML;

    } catch (error) {
        console.error("Ошибка при загрузке лидерборда:", error);
        container.innerHTML = '<p>Не удалось загрузить данные. Попробуйте позже.</p>';
    }
}

function calculateOverallStats(gradesData, selectedQuarter = null) {
    const allPercentages = [];
    const allGrades = [];
    
    if (selectedQuarter !== null) {
        // Если выбрана конкретная четверть, считаем только её
        const qKey = `q${selectedQuarter}`;
        if (gradesData.hasOwnProperty(qKey) && gradesData[qKey]) {
            const quarterData = gradesData[qKey];
            if (quarterData && quarterData.section) {
                for (const subjectName in quarterData.section) {
                    if (quarterData.section.hasOwnProperty(subjectName)) {
                        const percentage = calculateFinalPercentageForFriend(subjectName, quarterData);
                        if (percentage !== null && percentage >= 0) {
                            allPercentages.push(percentage);
                            allGrades.push(getGradeFromPercentage(percentage));
                        }
                    }
                }
            }
        }
    } else {
        // Если выбраны все четверти, считаем все
        for (const quarterKey in gradesData) {
            if (gradesData.hasOwnProperty(quarterKey)) {
                const quarterData = gradesData[quarterKey];
                if (quarterData && quarterData.section) {
                    for (const subjectName in quarterData.section) {
                        if (quarterData.section.hasOwnProperty(subjectName)) {
                            const percentage = calculateFinalPercentageForFriend(subjectName, quarterData);
                            if (percentage !== null && percentage >= 0) {
                                allPercentages.push(percentage);
                                allGrades.push(getGradeFromPercentage(percentage));
                            }
                        }
                    }
                }
            }
        }
    }
    
    if (allPercentages.length === 0) {
        return { averagePercentage: 0, averageGrade: 0 };
    }
    
    const avgPercentage = allPercentages.reduce((a, b) => a + b, 0) / allPercentages.length;
    const avgGrade = allGrades.reduce((a, b) => a + b, 0) / allGrades.length;
    return { averagePercentage: avgPercentage, averageGrade: avgGrade };
}
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
        authorPhotoURL: isAnonymous ? 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png' : (userProfile.photoURL || 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'),
        // Сохраняем префиксы на момент публикации
        authorPrefixes: isAnonymous ? [] : (userProfile.prefixes || [])
    };
    if (imageURL) {
        postData.imageURL = imageURL;
    }
    // Выбираем правильную базу данных в зависимости от категории
    const postsRef = currentForumCategory === 'homework' ? db.ref('homeworkPosts') : db.ref('posts');
    postsRef.push(postData)
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
function handleDeletePost(postId) { 
    const postsRef = currentForumCategory === 'homework' ? db.ref('homeworkPosts') : db.ref('posts');
    postsRef.child(postId).remove().catch(error => { 
        console.error("Ошибка при удалении поста:", error); 
        alert("Не удалось удалить пост. У вас может не быть прав на это действие."); 
    }); 
}
function formatTimestamp(ts) { const date = new Date(ts); return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

function renderChatView() {
    const postsContainer = document.getElementById('posts-container');
    
    // Отключаем предыдущий listener, если он существует
    if (postsRef && postsListener) {
        postsRef.off('value', postsListener);
    }
    
    // Выбираем правильную базу данных в зависимости от категории
    const postsPath = currentForumCategory === 'homework' ? 'homeworkPosts' : 'posts';
    postsRef = db.ref(postsPath).orderByChild('timestamp').limitToLast(100);

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
            const postKey = `${postsPath}_${post.id}`;
            if (currentUser && !postsViewedInSession[postKey]) {
                postsViewedInSession[postKey] = true;
                db.ref(`${postsPath}/${post.id}/views/${currentUser.uid}`).set(true);
            }

            const likes = post.likes || {};
            const likeCount = Object.keys(likes).length;
            const isLikedByCurrentUser = currentUser && likes[currentUser.uid];
            
            const views = post.views || {};
            const viewCount = Object.keys(views).length;
            
            let viewCounterHtml = '';
            if (currentUser && (post.uid === currentUser.uid || userProfile.isAdmin)) {
                viewCounterHtml = `
                    <div class="view-counter action-btn">
                        <svg viewBox="0 0 24 24"><path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/></svg>
                        <span>${viewCount}</span>
                    </div>`;
            }

            let repliesHtml = '';
            if (post.replies) {
                repliesHtml += '<div class="replies-container">';
                Object.entries(post.replies).sort((a, b) => a[1].timestamp - b[1].timestamp).forEach(([replyId, reply]) => {
                    const replyLikes = reply.likes || {};
                    const replyLikeCount = Object.keys(replyLikes).length;
                    const isReplyLiked = currentUser && replyLikes[currentUser.uid];
                    const canDeleteReply = currentUser && (reply.uid === currentUser.uid || userProfile.isAdmin);
                    const replyDeleteBtnHtml = canDeleteReply ? `<button class="reply-delete-btn" data-post-id="${post.id}" data-reply-id="${replyId}">&times;</button>` : '';

                    // Отображаем префиксы в ответах
                    const replyPrefixesHtml = generatePrefixesHtml(reply.authorPrefixes);

                    repliesHtml += `
                        <div class="reply-card">
                            <img src="${reply.authorPhotoURL || 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'}" class="reply-avatar">
                            <div class="reply-content">
                                ${replyDeleteBtnHtml}
                                <span class="reply-author">${reply.username} ${replyPrefixesHtml}</span>
                                <p class="reply-text">${reply.text}</p>
                                <div class="reply-actions">
                                     <button class="reply-like-btn action-btn ${isReplyLiked ? 'liked' : ''}" data-post-id="${post.id}" data-reply-id="${replyId}">
                                        <svg viewBox="0 0 24 24"><path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"></path></svg>
                                        <span>${replyLikeCount}</span>
                                    </button>
                                </div>
                                <div class="reply-timestamp">${formatTimestamp(reply.timestamp)}</div>
                            </div>
                        </div>
                    `;
                });
                repliesHtml += '</div>';
            }

            // Отображаем префиксы в постах
            const postPrefixesHtml = generatePrefixesHtml(post.authorPrefixes);
            let authorHtml = post.isAnonymous 
                ? `<span class="post-author anonymous">${post.username}</span>`
                : `<span class="post-author clickable-username" data-username="${post.username}">${post.username}</span> ${postPrefixesHtml}`;
            
            const deleteButtonHtml = (currentUser && (post.uid === currentUser.uid || userProfile.isAdmin)) ? `<button class="post-delete-btn" data-post-id="${post.id}">&times;</button>` : '';
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
                    <div class="post-actions">
                        <button class="like-btn action-btn ${isLikedByCurrentUser ? 'liked' : ''}" data-post-id="${post.id}">
                            <svg viewBox="0 0 24 24"><path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"></path></svg>
                            <span>${likeCount}</span>
                        </button>
                        <button class="reply-toggle-btn action-btn" data-post-id="${post.id}">
                             <svg viewBox="0 0 24 24"><path d="M9,22A1,1 0 0,1 8,21V18H4A2,2 0 0,1 2,16V4C2,2.89 2.9,2 4,2H20A2,2 0 0,1 22,4V16A2,2 0 0,1 20,18H13.9L10.2,21.71C10,21.9 9.75,22 9.5,22V22H9Z" /></svg>
                             <span>Ответить</span>
                        </button>
                        ${viewCounterHtml}
                    </div>
                    ${repliesHtml}
                    <div class="reply-form hidden" id="reply-form-${post.id}">
                        <input type="text" id="reply-input-${post.id}" class="reply-input" placeholder="Написать ответ...">
                        <button class="button reply-submit-btn" data-post-id="${post.id}">Отправить</button>
                    </div>
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

function handleLikeToggle(postId) {
    if (!currentUser) return;
    const postsPath = currentForumCategory === 'homework' ? 'homeworkPosts' : 'posts';
    const likeRef = db.ref(`${postsPath}/${postId}/likes/${currentUser.uid}`);
    likeRef.transaction(currentData => (currentData ? null : true));
}

function handleReplyLikeToggle(postId, replyId) {
    if (!currentUser) return;
    const postsPath = currentForumCategory === 'homework' ? 'homeworkPosts' : 'posts';
    const likeRef = db.ref(`${postsPath}/${postId}/replies/${replyId}/likes/${currentUser.uid}`);
    likeRef.transaction(currentData => (currentData ? null : true));
}

function handleReplySubmit(postId) {
    if (!currentUser) return;
    const replyInput = document.getElementById(`reply-input-${postId}`);
    const text = replyInput.value.trim();
    if (!text) { alert('Ответ не может быть пустым.'); return; }
    const replyData = {
        uid: currentUser.uid,
        username: userProfile.username,
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        authorPhotoURL: userProfile.photoURL || 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png',
        // Сохраняем префиксы на момент ответа
        authorPrefixes: userProfile.prefixes || []
    };
    const postsPath = currentForumCategory === 'homework' ? 'homeworkPosts' : 'posts';
    db.ref(`${postsPath}/${postId}/replies`).push(replyData)
        .then(() => { replyInput.value = ''; })
        .catch(error => { console.error("Ошибка при отправке ответа:", error); alert("Не удалось отправить ответ."); });
}

function handleDeleteReply(postId, replyId) {
    const postsPath = currentForumCategory === 'homework' ? 'homeworkPosts' : 'posts';
    db.ref(`${postsPath}/${postId}/replies/${replyId}`).remove()
        .catch(error => { console.error("Ошибка при удалении ответа:", error); alert("Не удалось удалить ответ."); });
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

// --- НОВЫЕ ФУНКЦИИ ДЛЯ ОБЪЯВЛЕНИЙ ---

async function checkForAnnouncements() {
    if (!currentUser) return;

    // 1. Получаем все необходимые данные параллельно
    const [userAnnouncementsSnap, globalAnnouncementsSnap, seenAnnouncementsSnap] = await Promise.all([
        db.ref(`announcements/user/${currentUser.uid}`).once('value'),
        db.ref('announcements/global').once('value'),
        db.ref(`users/${currentUser.uid}/seenAnnouncements`).once('value')
    ]);

    const userAnnouncements = userAnnouncementsSnap.val() || {};
    const globalAnnouncements = globalAnnouncementsSnap.val() || {};
    const seenAnnouncements = seenAnnouncementsSnap.val() || {};

    // 2. Объединяем все объявления и фильтруем просмотренные
    const allAnnouncements = { ...globalAnnouncements, ...userAnnouncements };
    const unseenAnnouncements = Object.entries(allAnnouncements)
        .filter(([id]) => !seenAnnouncements[id]);

    // 3. Если есть непросмотренные, показываем самое новое
    if (unseenAnnouncements.length > 0) {
        unseenAnnouncements.sort((a, b) => b[1].timestamp - a[1].timestamp);
        const [latestId, latestData] = unseenAnnouncements[0];
        displayAnnouncement(latestId, latestData);
    }
}

function displayAnnouncement(announcementId, announcementData) {
    const overlay = document.getElementById('announcement-overlay');
    const textElement = document.getElementById('announcement-text');
    const closeBtn = document.getElementById('announcement-close-btn');

    textElement.textContent = announcementData.message;
    overlay.classList.remove('hidden');

    const closeHandler = () => {
        overlay.classList.add('hidden');
        // Отмечаем как просмотренное в Firebase
        db.ref(`users/${currentUser.uid}/seenAnnouncements/${announcementId}`).set(true);
        // Удаляем обработчик, чтобы избежать дублирования
        closeBtn.removeEventListener('click', closeHandler);
    };
    
    closeBtn.addEventListener('click', closeHandler);
}

// --- ФУНКЦИИ АДМИН ПАНЕЛИ ---

function renderAdminPanel() {
    switchAdminTab('users');
}

function switchAdminTab(tabName) {
    document.querySelector('.admin-tab.active')?.classList.remove('active');
    document.getElementById(`admin-tab-${tabName}`)?.classList.add('active');
    
    const container = document.getElementById('admin-content-container');
    container.innerHTML = '<p>Загрузка данных...</p>';

    // Отключаем listeners при переключении вкладок
    if (tabName !== 'users') {
        Object.values(adminUsersListeners).forEach(listener => {
            if (listener && listener.ref && listener.callback) {
                listener.ref.off('value', listener.callback);
            }
        });
        adminUsersListeners = {};
    }

    if (tabName === 'users') {
        renderAdminUsersTab();
    } else if (tabName === 'posts') {
        renderAdminPostsTab();
    } else if (tabName === 'messages') {
        renderAdminMessagesTab();
    } else if (tabName === 'prefixes') {
        renderAdminPrefixesTab();
    }
}

async function renderAdminUsersTab() {
    const container = document.getElementById('admin-content-container');
    container.innerHTML = '<p>Загрузка списка пользователей...</p>';

    try {
        // Проверяем, является ли пользователь админом
        let isAdmin = false;
        if (currentUser) {
            try {
                const idTokenResult = await currentUser.getIdTokenResult();
                isAdmin = !!idTokenResult.claims.admin;
            } catch (e) {
                console.error("Ошибка при проверке прав админа:", e);
            }
        }

        // Если админ, загружаем всех пользователей напрямую через users
        // Если не админ, используем запрос только для публичных
        if (isAdmin) {
            // Админ может видеть всех пользователей напрямую
            const usersSnapshot = await db.ref('users').once('value');
            if (usersSnapshot.exists()) {
                allUsersDataCache = {};
                usersSnapshot.forEach(childSnapshot => {
                    allUsersDataCache[childSnapshot.key] = childSnapshot.val();
                });
            } else {
                allUsersDataCache = {};
            }
        } else {
            // Не админ - только публичные профили через запрос
            const usersRef = db.ref('users');
            const publicUsersSnapshot = await usersRef.orderByChild('profile/isPublic').equalTo(true).once('value');
            
            allUsersDataCache = {};
            if (publicUsersSnapshot.exists()) {
                publicUsersSnapshot.forEach(childSnapshot => {
                    allUsersDataCache[childSnapshot.key] = childSnapshot.val();
                });
            }
        }

        if (Object.keys(allUsersDataCache).length === 0) {
             container.innerHTML = '<p>Не удалось загрузить данные профилей.</p>';
             return;
        }

        // Отключаем предыдущие listeners
        Object.values(adminUsersListeners).forEach(listener => {
            if (listener && listener.ref && listener.callback) {
                listener.ref.off('value', listener.callback);
            }
        });
        adminUsersListeners = {};
        
        let usersHtml = '';
        for (const uid in allUsersDataCache) {
            const user = allUsersDataCache[uid];
            if (!user.profile) continue;
            
            // Добавляем префиксы в отображение
            const prefixesHtml = generatePrefixesHtml(user.profile.prefixes);
            const lastSeenText = formatLastSeen(user.lastSeen);

            usersHtml += `
                <div class="admin-user-card" id="admin-user-${uid}">
                    <div id="user-display-${uid}">
                        <div class="admin-user-info">
                            <img src="${user.profile.photoURL || 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'}" alt="Фото профиля">
                            <div class="admin-user-details">
                                <p><strong>Имя:</strong> ${user.profile.username} ${prefixesHtml}</p>
                                <p><strong>Класс:</strong> ${user.profile.class}</p>
                                <p class="email-info"><strong>Email:</strong> ${user.profile.email}</p>
                                <p class="last-seen-info"><strong>Последний раз в сети:</strong> <span id="last-seen-${uid}">${lastSeenText}</span></p>
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
            
            // Устанавливаем listener для отслеживания lastSeen в реальном времени
            const lastSeenRef = db.ref(`users/${uid}/lastSeen`);
            const lastSeenCallback = (snapshot) => {
                const lastSeenElement = document.getElementById(`last-seen-${uid}`);
                if (lastSeenElement) {
                    const timestamp = snapshot.val();
                    lastSeenElement.textContent = formatLastSeen(timestamp);
                    // Обновляем кеш
                    if (allUsersDataCache[uid]) {
                        allUsersDataCache[uid].lastSeen = timestamp;
                    }
                }
            };
            lastSeenRef.on('value', lastSeenCallback);
            adminUsersListeners[uid] = { ref: lastSeenRef, callback: lastSeenCallback };
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
             await renderAdminUsersTab();
             container.innerHTML = '<p>Загрузка постов...</p>';
        }

        // Добавляем переключатель категорий
        const categorySelector = `
            <div class="forum-categories" style="margin-bottom: 20px;">
                <button class="forum-category-btn ${currentAdminPostsCategory === 'chat' ? 'active' : ''}" data-category="chat" onclick="switchAdminPostsCategory('chat')">Чат</button>
                <button class="forum-category-btn ${currentAdminPostsCategory === 'homework' ? 'active' : ''}" data-category="homework" onclick="switchAdminPostsCategory('homework')">ДЗ</button>
            </div>
        `;

        const postsPath = currentAdminPostsCategory === 'homework' ? 'homeworkPosts' : 'posts';
        const postsSnapshot = await db.ref(postsPath).orderByChild('timestamp').once('value');
        if (!postsSnapshot.exists()) {
            container.innerHTML = categorySelector + '<p>Постов нет.</p>';
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
            
            const likers = post.likes ? Object.keys(post.likes).map(uid => allUsersDataCache[uid]?.profile?.username || `id:${uid.substring(0,5)}`).join(', ') : 'Никто';
            const viewers = post.views ? Object.keys(post.views).map(uid => allUsersDataCache[uid]?.profile?.username || `id:${uid.substring(0,5)}`).join(', ') : 'Никто';
            
            let repliesAdminHtml = '';
            if (post.replies) {
                repliesAdminHtml = '<div class="admin-replies-container">';
                Object.entries(post.replies).forEach(([replyId, reply]) => {
                    const replyLikers = reply.likes ? Object.keys(reply.likes).map(uid => allUsersDataCache[uid]?.profile?.username || `id:${uid.substring(0,5)}`).join(', ') : 'Никто';
                    repliesAdminHtml += `
                        <div class="admin-reply-card" id="admin-reply-${replyId}">
                            <div class="admin-reply-header">
                                <span>Ответ от <strong>${reply.username}</strong></span>
                                <button class="button secondary" style="padding: 2px 8px; font-size: 12px;" onclick="adminDeleteReply('${post.id}', '${replyId}')">Удалить</button>
                            </div>
                            <p>${reply.text}</p>
                            <div class="admin-interaction-list" style="border-top: none; padding-top: 5px; margin-top: 5px;">
                                <p style="font-size: 0.9em;"><strong>Лайкнули:</strong> <span>${replyLikers}</span></p>
                            </div>
                        </div>
                    `;
                });
                repliesAdminHtml += '</div>';
            }

            postsHtml += `
                <div class="admin-post-card" id="admin-post-${post.id}">
                    <div class="post-header">
                         <img src="${authorPhoto || 'https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png'}" class="post-avatar">
                         <div class="post-author-info">
                            ${authorInfo}
                            <span class="post-timestamp">${formatTimestamp(post.timestamp)}</span>
                         </div>
                    </div>
                    ${post.text ? `<p class="post-body">${post.text}</p>` : ''}
                    ${post.imageURL ? `<img src="${post.imageURL}" class="post-image" alt="Прикрепленное изображение" style="max-width: 200px;">` : ''}
                    <div class="admin-interaction-list">
                        <p><strong>Лайкнули пост:</strong> <span>${likers}</span></p>
                        <p><strong>Просмотрели:</strong> <span>${viewers}</span></p>
                    </div>
                    ${repliesAdminHtml}
                    <div class="admin-user-actions">
                        <button class="button secondary" onclick="adminDeletePost('${post.id}')">Удалить пост</button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = categorySelector + postsHtml;
    } catch (error) {
        console.error("Ошибка при загрузке постов:", error);
        container.innerHTML = categorySelector + '<p>Не удалось загрузить посты.</p>';
    }
}

function switchAdminPostsCategory(category) {
    currentAdminPostsCategory = category;
    renderAdminPostsTab();
}

function adminDeletePost(postId) {
    if (!confirm("Вы уверены, что хотите удалить этот пост?")) return;
    const postsPath = currentAdminPostsCategory === 'homework' ? 'homeworkPosts' : 'posts';
    db.ref(`${postsPath}/${postId}`).remove()
        .then(() => {
            alert("Пост удален.");
            document.getElementById(`admin-post-${postId}`)?.remove();
        })
        .catch(error => {
            console.error("Ошибка при удалении поста:", error);
            alert("Не удалось удалить пост.");
        });
}

function adminDeleteReply(postId, replyId) {
    if (!confirm("Вы уверены, что хотите удалить этот ответ?")) return;
    const postsPath = currentAdminPostsCategory === 'homework' ? 'homeworkPosts' : 'posts';
    db.ref(`${postsPath}/${postId}/replies/${replyId}`).remove()
        .then(() => {
            alert("Ответ удален.");
            document.getElementById(`admin-reply-${replyId}`)?.remove();
        })
        .catch(error => {
            console.error("Ошибка при удалении ответа:", error);
            alert("Не удалось удалить ответ.");
        });
}

// --- НОВЫЕ ФУНКЦИИ ДЛЯ ПРЕФИКСОВ ---
async function renderAdminPrefixesTab() {
    const container = document.getElementById('admin-content-container');
    
    if (!allUsersDataCache) {
        await renderAdminUsersTab();
        renderAdminPrefixesTab();
        return;
    }

    let userOptions = '<option value="">-- Выберите пользователя --</option>';
    const sortedUsers = Object.entries(allUsersDataCache).sort((a, b) => 
        a[1].profile.username.localeCompare(b[1].profile.username)
    );

    for (const [uid, user] of sortedUsers) {
        if (user.profile) {
            userOptions += `<option value="${uid}">${user.profile.username}</option>`;
        }
    }

    container.innerHTML = `
        <div class="admin-prefix-manager">
            <div class="admin-prefix-controls">
                <label for="admin-prefix-user-select">Пользователь:</label>
                <select id="admin-prefix-user-select">${userOptions}</select>
            </div>
            
            <div id="admin-current-prefixes">
                <p>Текущие префиксы:</p>
                <div id="admin-current-prefixes-list">
                    <span class="text-muted">Сначала выберите пользователя</span>
                </div>
            </div>

            <div id="admin-add-prefix-form" class="hidden">
                <p><strong>Добавить новый префикс:</strong></p>
                <div id="admin-add-prefix-form-controls">
                    <input type="file" id="admin-prefix-file-input" accept=".png">
                    <button id="admin-prefix-add-btn" class="button">Загрузить и добавить</button>
                </div>
                <img id="admin-prefix-preview" class="hidden" src="#" alt="Предпросмотр префикса">
            </div>
        </div>
    `;

    document.getElementById('admin-prefix-user-select').addEventListener('change', (e) => {
        displayPrefixesForUser(e.target.value);
    });

    document.getElementById('admin-prefix-file-input').addEventListener('change', (e) => {
        const preview = document.getElementById('admin-prefix-preview');
        const file = e.target.files[0];
        if (file) {
            preview.src = URL.createObjectURL(file);
            preview.classList.remove('hidden');
        } else {
            preview.classList.add('hidden');
        }
    });

    document.getElementById('admin-prefix-add-btn').addEventListener('click', handleAdminPrefixUpload);
}

function displayPrefixesForUser(uid) {
    const listContainer = document.getElementById('admin-current-prefixes-list');
    const form = document.getElementById('admin-add-prefix-form');
    
    if (!uid) {
        listContainer.innerHTML = '<span class="text-muted">Сначала выберите пользователя</span>';
        form.classList.add('hidden');
        return;
    }

    form.classList.remove('hidden');
    const user = allUsersDataCache[uid];
    const prefixes = user?.profile?.prefixes || [];

    if (prefixes.length === 0) {
        listContainer.innerHTML = '<span class="text-muted">У этого пользователя нет префиксов.</span>';
        return;
    }

    listContainer.innerHTML = prefixes.map((url, index) => `
        <div class="admin-prefix-item">
            <img src="${url}" alt="Префикс ${index + 1}">
            <button class="admin-prefix-delete-btn" onclick="adminDeletePrefix('${uid}', ${index})">&times;</button>
        </div>
    `).join('');
}

async function handleAdminPrefixUpload() {
    const userSelect = document.getElementById('admin-prefix-user-select');
    const fileInput = document.getElementById('admin-prefix-file-input');
    const addButton = document.getElementById('admin-prefix-add-btn');
    const uid = userSelect.value;
    const file = fileInput.files[0];

    if (!uid) {
        alert('Пожалуйста, выберите пользователя.');
        return;
    }
    if (!file) {
        alert('Пожалуйста, выберите PNG файл для загрузки.');
        return;
    }
    if (file.type !== 'image/png') {
        alert('Можно загружать только файлы в формате PNG.');
        return;
    }

    addButton.disabled = true;
    addButton.classList.add('loading');

    try {
        const imageURL = await uploadToCloudinary(file);
        
        const userPrefixesRef = db.ref(`users/${uid}/profile/prefixes`);
        const snapshot = await userPrefixesRef.once('value');
        const currentPrefixes = snapshot.val() || [];
        
        currentPrefixes.push(imageURL);
        
        await userPrefixesRef.set(currentPrefixes);
        
        // Обновляем кеш
        if (allUsersDataCache[uid] && allUsersDataCache[uid].profile) {
            allUsersDataCache[uid].profile.prefixes = currentPrefixes;
        }

        alert('Префикс успешно добавлен!');
        fileInput.value = ''; // Сброс инпута
        document.getElementById('admin-prefix-preview').classList.add('hidden');
        displayPrefixesForUser(uid); // Обновляем отображение

    } catch (error) {
        console.error('Ошибка при добавлении префикса:', error);
        alert('Не удалось добавить префикс.');
    } finally {
        addButton.disabled = false;
        addButton.classList.remove('loading');
    }
}

async function adminDeletePrefix(uid, index) {
    if (!confirm(`Вы уверены, что хотите удалить этот префикс?`)) {
        return;
    }
    
    try {
        const userPrefixesRef = db.ref(`users/${uid}/profile/prefixes`);
        const snapshot = await userPrefixesRef.once('value');
        let currentPrefixes = snapshot.val() || [];
        
        if (index >= 0 && index < currentPrefixes.length) {
            currentPrefixes.splice(index, 1);
        }

        await userPrefixesRef.set(currentPrefixes);

        if (allUsersDataCache[uid] && allUsersDataCache[uid].profile) {
            allUsersDataCache[uid].profile.prefixes = currentPrefixes;
        }
        
        alert('Префикс удален.');
        displayPrefixesForUser(uid);

    } catch (error) {
        console.error('Ошибка при удалении префикса:', error);
        alert('Не удалось удалить префикс.');
    }
}


// НОВЫЕ ФУНКЦИИ ДЛЯ ВКЛАДКИ СООБЩЕНИЙ В АДМИН-ПАНЕЛИ
async function renderAdminMessagesTab() {
    const container = document.getElementById('admin-content-container');
    
    // Убедимся, что кеш пользователей загружен
    if (!allUsersDataCache) {
        await renderAdminUsersTab();
        // После загрузки renderAdminUsersTab уже отрисует свой контент,
        // поэтому нам нужно снова вызвать эту функцию, чтобы отрисовать вкладку сообщений
        renderAdminMessagesTab(); 
        return;
    }

    let userOptions = '<option value="all">Всем пользователям</option>';
    if(allUsersDataCache) {
        for(const uid in allUsersDataCache) {
            const username = allUsersDataCache[uid]?.profile?.username;
            if (username) {
                userOptions += `<option value="${username}">${username}</option>`;
            }
        }
    }

    container.innerHTML = `
        <div class="admin-messages-form">
            <textarea id="admin-message-text" placeholder="Введите ваше сообщение здесь..."></textarea>
            <div class="admin-messages-controls">
                <label for="admin-message-recipient">Отправить:</label>
                <select id="admin-message-recipient">
                    ${userOptions}
                </select>
                <button id="admin-send-message-btn" class="button">Отправить</button>
            </div>
        </div>
    `;

    document.getElementById('admin-send-message-btn').addEventListener('click', handleAdminMessageSend);
}

async function handleAdminMessageSend() {
    const messageText = document.getElementById('admin-message-text').value.trim();
    const recipient = document.getElementById('admin-message-recipient').value;

    if (!messageText) {
        alert('Сообщение не может быть пустым.');
        return;
    }

    const announcement = {
        message: messageText,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    try {
        if (recipient === 'all') {
            await db.ref('announcements/global').push(announcement);
            alert('Глобальное сообщение успешно отправлено!');
        } else {
            // recipient - это username. Нужно найти UID.
            const usernameSnapshot = await db.ref('usernames').child(recipient.toLowerCase()).once('value');
            if (usernameSnapshot.exists()) {
                const uid = usernameSnapshot.val();
                await db.ref(`announcements/user/${uid}`).push(announcement);
                alert(`Сообщение успешно отправлено пользователю ${recipient}!`);
            } else {
                alert(`Ошибка: пользователь с именем ${recipient} не найден.`);
                return;
            }
        }
        document.getElementById('admin-message-text').value = ''; // Очищаем поле
    } catch (error) {
        console.error('Ошибка при отправке сообщения:', error);
        alert('Не удалось отправить сообщение. Проверьте консоль на наличие ошибок.');
    }
}
