let currentUser = null;
let currentCard = null;

const accessRules = {
    Student: ["Main Entrance", "Library"],
    Employee: ["Main Entrance", "Library", "Laboratory"],
    Admin: ["Main Entrance", "Library", "Laboratory", "Server Room"],
    Guest: ["Main Entrance"]
};

async function signUp() {
    let email = document.getElementById("loginEmail").value.trim();
    let password = document.getElementById("loginPassword").value;
    let message = document.getElementById("loginMessage");

    const { error } = await supabaseClient.auth.signUp({
        email: email,
        password: password
    });

    if (error) {
        message.style.color = "#ef4444";
        message.innerText = error.message;
        return;
    }

    message.style.color = "#2dd4df";
    message.innerText = "Account created. Please confirm your email, then login.";
}

async function login() {
    let email = document.getElementById("loginEmail").value.trim();
    let password = document.getElementById("loginPassword").value;
    let message = document.getElementById("loginMessage");

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        message.style.color = "#ef4444";
        message.innerText = error.message;
        return;
    }

    currentUser = data.user;
    await createCardIfNeeded();
    window.location.href = "dashboard.html";
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
}

async function protectPage() {
    if (location.pathname.includes("index.html")) return;

    const { data } = await supabaseClient.auth.getSession();

    if (!data.session) {
        window.location.href = "index.html";
        return;
    }

    currentUser = data.session.user;
    await createCardIfNeeded();
}

function generateCode() {
    return "NFC-" + Math.floor(10000000 + Math.random() * 90000000);
}

function generateUid() {
    let input = document.getElementById("cardUid");
    if (input) input.value = generateCode();
}

async function createCardIfNeeded() {
    const { data: existing } = await supabaseClient
        .from("cards")
        .select("*")
        .eq("user_id", currentUser.id)
        .limit(1);

    if (existing && existing.length > 0) {
        currentCard = existing[0];
        return;
    }

    const { data } = await supabaseClient
        .from("cards")
        .insert([{
            user_id: currentUser.id,
            email: currentUser.email,
            full_name: currentUser.email.split("@")[0],
            uid: generateCode(),
            role: "Student",
            status: "Active"
        }])
        .select();

    if (data && data.length > 0) {
        currentCard = data[0];
    }
}

async function getCards() {
    const { data } = await supabaseClient
        .from("cards")
        .select("*")
        .order("created_at", { ascending: false });

    return data || [];
}

async function getLogs() {
    const { data } = await supabaseClient
        .from("access_logs")
        .select("*")
        .order("created_at", { ascending: false });

    return data || [];
}

async function addUser() {
    let name = document.getElementById("fullName").value.trim();
    let role = document.getElementById("role").value;
    let status = document.getElementById("status").value;
    let uid = document.getElementById("cardUid").value.trim().toUpperCase();
    let message = document.getElementById("userMessage");

    if (!name || !uid) {
        message.innerText = "Please fill name and UID.";
        return;
    }

    const { error } = await supabaseClient.from("cards").insert([{
        user_id: currentUser.id,
        email: currentUser.email,
        full_name: name,
        uid: uid,
        role: role,
        status: status
    }]);

    if (error) {
        message.style.color = "#ef4444";
        message.innerText = error.message;
        return;
    }

    message.style.color = "#2dd4df";
    message.innerText = "Card registered successfully.";
    showUsers();
    updateDashboard();
}

async function showUsers() {
    let table = document.getElementById("usersTable");
    if (!table) return;

    let cards = await getCards();
    table.innerHTML = "";

    cards.forEach(card => {
        let statusClass = card.status === "Active" ? "success" : "denied";

        table.innerHTML += `
            <tr>
                <td>${card.full_name || "-"}</td>
                <td>${card.email || "-"}</td>
                <td>-</td>
                <td>${card.role}</td>
                <td>${card.uid}</td>
                <td class="${statusClass}">${card.status}</td>
                <td>-</td>
            </tr>
        `;
    });
}

function checkAccess(card, locationName) {
    if (!card) {
        return ["Denied", "Card UID not found"];
    }

    if (card.status !== "Active") {
        return ["Denied", "Card is not active"];
    }

    if (!accessRules[card.role].includes(locationName)) {
        return ["Denied", "Role does not allow this location"];
    }

    return ["Granted", "Valid card and allowed location"];
}

async function scanCard() {
    let uid = document.getElementById("scanUid").value.trim().toUpperCase();
    let locationBox = document.getElementById("scanLocation");
    let locationName = locationBox ? locationBox.value : "Main Entrance";
    let resultBox = document.getElementById("scanResult");

    if (!uid) {
        resultBox.innerHTML = "<h4>Please enter card UID.</h4>";
        return;
    }

    let cards = await getCards();
    let card = cards.find(item => item.uid === uid);
    let access = checkAccess(card, locationName);

    await supabaseClient.from("access_logs").insert([{
        card_uid: uid,
        email: card ? card.email : "Unknown",
        location: locationName,
        result: access[0],
        reason: access[1]
    }]);

    let resultClass = access[0] === "Granted" ? "success" : "denied";

    resultBox.innerHTML = `
        <h4 class="${resultClass}">ACCESS ${access[0].toUpperCase()}</h4>
        <p>User: ${card ? card.full_name : "Unknown"}</p>
        <p>UID: ${uid}</p>
        <p>Location: ${locationName}</p>
        <p>Reason: ${access[1]}</p>
    `;

    showLogs();
    updateDashboard();
}

async function randomScan() {
    let cards = await getCards();
    let unknown = ["NFC-90441122", "NFC-33902176", "NFC-77812091"];
    let all = cards.map(card => card.uid).concat(unknown);
    let uid = all[Math.floor(Math.random() * all.length)];

    document.getElementById("scanUid").value = uid;
    scanCard();
}

async function showLogs() {
    let table = document.getElementById("logsTable");
    if (!table) return;

    let logs = await getLogs();
    table.innerHTML = "";

    logs.forEach(log => {
        let resultClass = log.result === "Granted" ? "success" : "denied";

        table.innerHTML += `
            <tr>
                <td>${new Date(log.created_at).toLocaleString()}</td>
                <td>${log.card_uid}</td>
                <td>${log.email || "-"}</td>
                <td>-</td>
                <td>${log.location}</td>
                <td class="${resultClass}">${log.result}</td>
                <td>${log.reason}</td>
            </tr>
        `;
    });
}

async function clearLogs() {
    alert("Logs are stored in Supabase. You can clear them from the database panel.");
}

async function updateDashboard() {
    let cards = await getCards();
    let logs = await getLogs();

    if (document.getElementById("totalUsers")) {
        document.getElementById("totalUsers").innerText = cards.length;
        document.getElementById("activeCards").innerText = cards.filter(c => c.status === "Active").length;
        document.getElementById("grantedAccess").innerText = logs.filter(l => l.result === "Granted").length;
        document.getElementById("deniedAccess").innerText = logs.filter(l => l.result === "Denied").length;
    }

    let last = logs[0];

    if (last && document.getElementById("lastUid")) {
        document.getElementById("lastUid").innerText = last.card_uid;
        document.getElementById("lastUser").innerText = last.email || "-";
        document.getElementById("lastLocation").innerText = last.location;
        document.getElementById("lastResult").innerText = last.result;
    }

    if (document.getElementById("logTotal")) {
        document.getElementById("logTotal").innerText = logs.length;
        document.getElementById("logGranted").innerText = logs.filter(l => l.result === "Granted").length;
        document.getElementById("logDenied").innerText = logs.filter(l => l.result === "Denied").length;
    }

    if (document.getElementById("reportUsers")) {
        document.getElementById("reportUsers").innerText = cards.length;
        document.getElementById("reportActive").innerText = cards.filter(c => c.status === "Active").length;
        document.getElementById("reportBlocked").innerText = cards.filter(c => c.status === "Blocked").length;
        document.getElementById("reportDenied").innerText = logs.filter(l => l.result === "Denied").length;
        document.getElementById("activeReportLine").innerText = cards.filter(c => c.status === "Active").length;
        document.getElementById("blockedReportLine").innerText = cards.filter(c => c.status === "Blocked").length;
        document.getElementById("expiredReportLine").innerText = cards.filter(c => c.status === "Expired").length;
    }
}

async function loadMyCard() {
    if (!document.getElementById("cardUidText")) return;

    const { data } = await supabaseClient
        .from("cards")
        .select("*")
        .eq("user_id", currentUser.id)
        .limit(1);

    if (!data || data.length === 0) return;

    currentCard = data[0];

    document.getElementById("cardEmail").innerText = currentCard.email || "-";
    document.getElementById("cardName").innerText = currentCard.full_name || "-";
    document.getElementById("cardUidText").innerText = currentCard.uid || "-";
    document.getElementById("cardRole").innerText = currentCard.role || "-";
    document.getElementById("cardStatus").innerText = currentCard.status || "-";

    let link = location.origin + "/scan.html?uid=" + encodeURIComponent(currentCard.uid);

    let qrBox = document.getElementById("qrcode");
    qrBox.innerHTML = "";

    new QRCode(qrBox, {
        text: link,
        width: 180,
        height: 180
    });
}

function openQrLink() {
    if (!currentCard) return;

    let link = location.origin + "/scan.html?uid=" + encodeURIComponent(currentCard.uid);
    window.open(link, "_blank");
}

async function startApp() {
    await protectPage();
    await showUsers();
    await showLogs();
    await updateDashboard();
    await loadMyCard();

    let params = new URLSearchParams(window.location.search);
    let uid = params.get("uid");

    if (uid && document.getElementById("scanUid")) {
        document.getElementById("scanUid").value = uid;
        scanCard();
    }
}

startApp();