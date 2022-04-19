/**
 * author: CuongPV10
 * 2022/04/10
 */

function init() {
    if (!window.location.href.includes("docs.google.com/spreadsheets/d/")) {
        return;
    }

    chrome.storage.local.set({ "import_status": { status: "collect" } }, function () {
        console.log('Value is set to ', "ready");
    });

    start();
}

async function start() {
    removeAllData();
    let baseUrl = "https://docs.google.com/spreadsheets";
    let URL = window.location.href;
    let matches = /\/([\w-_]{15,})\/(.*?gid=(\d+))?/.exec(URL);

    if (!matches) {
        saveData([], "n/a");
        return;
    }

    send_progress_message("start");
    let sheetId = matches[1];
    let file = await getFileFromUrl(`${baseUrl}/d/${sheetId}/export?format=xlsx&id=${sheetId}`,
        "c.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8");

    while (!document.querySelector(".docs-sheet-active-tab .docs-sheet-tab-name")) {
        send_progress_message("Wait for current sheet is loaded")
        await timeout(1000);
    }

    let currentSheet = document.querySelector(".docs-sheet-active-tab .docs-sheet-tab-name").innerText;
    send_progress_message(`Current sheet\n ${currentSheet}`);
    let process_data = await readFile(file, currentSheet);

    send_progress_message(`Validating`);
    chrome.runtime.sendMessage({ req: "process_data", data: process_data }, function (response) {
        saveData(response.payload, currentSheet);
    });
}

async function readFile(file, sheetName) {
    let settings = await get_settings();
    let temp_col_index = settings.bug.temp_col_index;
    let rows = await readXlsxFile(file, { sheet: sheetName.replaceAll("/", "") });
    const startRow = settings.bug.temp_col_index.__start_row_index;

    let dataList = [];

    send_progress_message(`Reading file`);
    for (let i = startRow; i < rows.length; i++) {
        // Record empty
        if (rows[i][2] == null) continue;

        let row_data = make_row_data(rows[i], temp_col_index);
        dataList.push(row_data);
    }

    send_progress_message(`Collect succes`);
    return dataList;
};

function make_row_data(row, temp_col_index) {
    let row_data = {};

    for (const key in temp_col_index) {
        const col_index = temp_col_index[key];
        // Ignore if null index
        if (col_index === null || key.startsWith("__")) {
            continue;
        }
        if (key.toLowerCase().includes("date")) {
            let date = moment(new Date(row[col_index])).format("YYYY/MM/DD");
            if (new Date(date) <= new Date("2012/01/01")) {
                row_data[key] = null;
            } else {
                row_data[key] = date;
            }

        } else {
            row_data[key] = row[col_index];
        }
    }

    return row_data;
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

async function getFileFromUrl(url, name, defaultType = 'image/jpeg') {
    const response = await fetch(url);
    const data = await response.blob();
    return new File([data], name, {
        type: data.type || defaultType,
    });
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function send_progress_message(str) {
    chrome.runtime.sendMessage({ req: "collect_prgress_info", data: str }, function (response) {
        console.log(response);
    });
}

async function saveData(dataList, sheetName) {
    let config = {
        title: document.querySelector("input.docs-title-input").value,
        sheetName: sheetName
    }

    chrome.storage.local.set({
        "bug_data": {
            dataList: dataList,
            config: config
        }
    }, function () {
        send_progress_message(`Data has been saved`);
    });
    await timeout(500);
}

function removeAllData() {
    chrome.storage.local.set({ "bug_data": null }, function () {
        console.log("Data has been removed.");
    });
}

/* Start collect data from sheet */ init();