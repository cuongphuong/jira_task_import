/*global chrome*/

/**
 * author: CuongPV10
 * 2022/04/10
 */

let isSupportSite = false;

/**
 * Check valid page and prepare data
 */
document.addEventListener('DOMContentLoaded', async function () {
    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tabs[0].id, { req: "check_site" }, async function (response) {
        if (response) {
            isSupportSite = true;
            setProcessIcon("img/load.png");
            await displayProcessData();
        } else {
            setProcessIcon("img/no_sp.png");
        }
    });

    // Message from content script
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (message.req === "collect_prgress_info") {
            document.getElementById("process_info").innerText = message.data;
            sendResponse();
        }
    });
});

/**
 * Process collect data on sheet
 */
document.getElementById("wait_id").addEventListener("click", function () {
    start_collect_data();
});

document.getElementById("reload_tab_id").addEventListener("click", function () {
    removeAllData();
    start_collect_data();
});

document.getElementById("settings_tab_id").addEventListener("click", function () {
    chrome.tabs.create({ active: true, url: '/function/settings/settings.html' }, null);
});

document.getElementById("review_tab_id").addEventListener("click", function () {
    chrome.tabs.create({ active: true, url: '/function/bug/bug_list.html' }, null);
});

async function start_collect_data() {
    if (!isSupportSite) return;
    // Start check data
    try {
        document.getElementById("well_come_id").style.display = "none";
    } catch (err) {

    }
    setProcessIcon("img/wait.gif");
    chrome.runtime.sendMessage({ req: "load" }, function (response) { console.log(response); });
    await displayProcessData();
}

async function displayProcessData() {
    while (!await loadData()) {
        console.log("Wait for collect data.");
        await timeout(1000);
    }
    setProcessIcon(null);
    let bugData = await loadData();

    let config = bugData.config;
    let html = "";
    html += `<h3>${config.title}</h3>`;
    html += `<p>(${config.sheetName})</p>`;

    document.getElementById("head_config").innerHTML = html;
    document.getElementById("total_record").innerText = bugData.dataList.length;

    let dataList = bugData.dataList;

    let newCount = dataList.filter(d => d.temp_checked_status.rsl_status.includes("NEW")).length;
    document.getElementById("record_create").innerText = newCount;

    let errorCount = dataList.filter(d => d.temp_checked_status.rsl_status.includes("ERROR")).length;
    document.getElementById("record_err").innerText = errorCount;

    let updateCount = dataList.filter(d => d.temp_checked_status.rsl_status.includes("UPDATE_BASE_DATA")
        || (d.temp_checked_status.rsl_status.includes("CHANGE_STATUS")
            && !d.temp_checked_status.rsl_status.includes("NEW") && !d.temp_checked_status.rsl_status.includes("ERROR"))).length;
    document.getElementById("record_update").innerText = updateCount;
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadData() {
    let response = await new Promise((resolve, reject) => chrome.storage.local.get("bug_data", function (res) {
        resolve(res);
    }));

    let bugData = null;
    if (response && response.hasOwnProperty("bug_data")) {
        bugData = response.bug_data;
    }
    return bugData;
}

function setProcessIcon(iconUrl) {
    let waitIcon = document.getElementById("wait_id");
    let collectProgress = document.getElementById("collect_progress");

    let headConf = document.getElementById("head_config");
    let collectInfo = document.getElementById("collect_info");

    waitIcon.style.display = "inline-block";
    collectProgress.style.display = "inline-block";

    headConf.style.display = "none"
    collectInfo.style.display = "none";

    if (!iconUrl) {
        waitIcon.style.display = "none";
        collectProgress.style.display = "none";

        headConf.style.display = "inline-block";
        collectInfo.style.display = "inline-block"

        return;
    }
    waitIcon.src = chrome.runtime.getURL(iconUrl);
}

function removeAllData() {
    chrome.storage.local.set({ "bug_data": null }, function () {
        console.log("Data has been removed.");
    });
}