/*global chrome*/

/**
 * author: CuongPV10
 * 2022/04/10
 */

async function init() {
    let baseUrl = "https://docs.google.com/spreadsheets";
    let configs = await get_settings();
    if (!configs) return;

    let frefix_temp_title = configs.common.frefix_template_title;
    const isValidSite = await checkValidSite(baseUrl, frefix_temp_title);
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (message.req === "check_site") {
            sendResponse(isValidSite);
        }
    });

    if (!isValidSite) return;

    removeAllData();
    await registEvent();
}

function removeAllData() {
    chrome.storage.local.set({ "bug_data": null }, function () {
        console.log("Data has been removed.");
    });
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkValidSite(baseUrl, frefix_temp_title) {
    if (!window.location.href.includes(baseUrl)) return false;
    while (!document.querySelector("input.docs-title-input")) {
        await timeout(1000);
    }
    let title = document.querySelector("input.docs-title-input").value;
    if (!title.includes(frefix_temp_title)) return false;
    return true;
}

async function registEvent() {
    let sheets = document.getElementsByClassName("goog-inline-block docs-sheet-tab docs-material");
    while (!sheets || sheets.length === 0) {
        console.log("Wait for get sheets data");
        await timeout(1000);
    }

    for (let i = 0; i < sheets.length; i++) {
        sheets[i].addEventListener("click", function () {
            // removeAllData();
        });
    }
}

async function get_settings() {
    let response = await new Promise((resolve, reject) => chrome.storage.local.get("settings", function (res) {
        resolve(res);
    }));

    let settings = null;
    if (response && response.hasOwnProperty("settings")) {
        settings = response.settings;
    }
    return settings;
}

/* Execute content script */ init();
