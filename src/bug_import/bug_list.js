/*global chrome*/

/**
 * author: CuongPV10
 * 2022/04/10
 */

document.getElementById("start_import").addEventListener("click", async function () {
    const configs = await get_settings();
    if (!configs) {
        chrome.tabs.create({ active: true, url: 'settings.html' }, null);
        chrome.runtime.sendMessage('', {
            req: "notif",
            options: {
                title: 'Settings',
                message: 'Please import settings!',
                iconUrl: '/img/ex_logo.png',
                type: 'basic'
            }
        }, function (response) {
            console.log(response);
        });
        return;
    }

    let data = await loadData();
    if (!data.dataList || data.dataList.length === 0) {
        alert("No record import/update");
        return;
    }

    let ignore = data.dataList.filter(p => p.temp_checked_status.rsl_status.includes("IGNORE"));
    if (ignore.length === data.dataList.length) {
        alert("No record import/update");
        return;
    }

    let import_status = await get_start_status();
    if (import_status.status === "done") {
        alert("Data has imported");
        return;
    }

    if (!confirm("Are you sure?")) {
        return;
    }

    // Ready import
    chrome.storage.local.set({ "import_status": { status: "ready", is_first_time: true } }, function () {
        console.log('Value is set to ', "ready");
    });

    window.location.href = configs.common.jira_base_url + "/login.jsp";
});

document.getElementById("close_tab").addEventListener("click", async function () {
    chrome.runtime.sendMessage({ req: "close_this_tab" }, function (response) { console.log(response); });
});

document.addEventListener('DOMContentLoaded', async function () {
    const header_configs = {
        description: "Description",
        assigner: "Assign",
        cause_analysis: "Cause Analysis",
        cause_category: "Cause Category",
        corrective_action: "Corrective Action",
        defect_origin: "Defect Origin",
        defect_type: "Defect Type",
        due_date: "Due Date",
        estimated_effort: "Estimated Effort",
        original_estimate: "Original Estimate",
        plan_start_date: "Plan Start",
        priority: "Priority",
        qc_activity: "QC Activity",
        remaining_estimate: "Remaining Estimate",
        reporter: "Reporter",
        role: "Role",
        severity: "Severity",
        summary: "Summary"
    }

    const configs = await get_settings();
    if (!configs) return;

    /* CHECK IMPORT STATUS *******************************/
    let import_status = await get_start_status();
    if (import_status && import_status.hasOwnProperty("result") && import_status.status === "done") {
        copyTextToClipboard(import_status.result)
    }

    // Set icon page
    var link = document.querySelector("link[rel~='icon']");
    link.href = chrome.runtime.getURL("img/ex_logo.ico");
    init();

    async function init() {
        makeHeader();
        let data = await loadData();
        renderDataTale(data.dataList);
    }

    function renderDataTale(bugData, filter) {
        // Sort column
        const temp_col_index = configs.bug.temp_col_index;

        const sortable = Object.fromEntries(
            Object.entries(temp_col_index).sort(([, a], [, b]) => a - b)
        );

        let html = "";
        for (let j = 0; j < bugData.length; j++) {

            if (filter && filter === "UPDATE") {
                if (bugData[j].temp_checked_status.rsl_status.includes("UPDATE_BASE_DATA")
                    || (bugData[j].temp_checked_status.rsl_status.includes("CHANGE_STATUS")
                        && !bugData[j].temp_checked_status.rsl_status.includes("NEW") && !bugData[j].temp_checked_status.rsl_status.includes("ERROR"))) {
                } else {
                    continue;
                }
            } else {
                if (filter && !bugData[j].temp_checked_status.rsl_status.includes(filter)) {
                    continue;
                }
            }

            let row_html = "";
            for (const key in sortable) {
                let col_index = sortable[key];
                // Ignore if null index
                if (col_index === null || key.startsWith("temp") || key.startsWith("__")) {
                    continue;
                }
                row_html += `<td class="error" data-bs-toggle="tooltip" data-bs-html="true" title="${bugData[j].temp_checked_status.rsl_msg.join("<br>")}"><pre class="content_fix">${bugData[j][key] != null ? escapeHtml(bugData[j][key]) : "(Empty)"}</pre></td>`;
            }

            let color = getBorderColor(bugData[j]);
            if (color === "red") {
                html += `<tr class="issue" style="border-bottom: solid 1px ${color}; background: #faf3f3">${row_html}</tr>`;
            } else {
                html += `<tr class="issue" style="border-bottom: solid 1px ${color}">${row_html}</tr>`;
            }
        }
        document.getElementById("data_content_id").innerHTML = html;

        let errorList = document.getElementsByClassName("error");

        for (let i = 0; i < errorList.length; i++) {
            new bootstrap.Tooltip(errorList[i], {
                boundary: document.body
            })
        }
    }

    function getBorderColor(issue) {
        if (issue.temp_checked_status.rsl_status.includes("ERROR")) {
            return "red";
        }

        if (issue.temp_checked_status.rsl_status.includes("NEW")) {
            return "green";
        }

        if (issue.temp_checked_status.rsl_status.includes("CHANGE_STATUS") || issue.temp_checked_status.rsl_status.includes("UPDATE_BASE_DATA")) {
            return "blue";
        }

        if (issue.temp_checked_status.rsl_status.includes("OK")) {
            return "#D0FA58";
        }
    }

    const escapeHtml = (unsafe) => {
        return unsafe.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    }

    function makeHeader() {
        // Sort column
        const temp_col_index = configs.bug.temp_col_index;

        const sortable = Object.fromEntries(
            Object.entries(temp_col_index).sort(([, a], [, b]) => a - b)
        );

        let html = "";
        for (const key in sortable) {
            let col_index = sortable[key];
            // Ignore if null index
            if (col_index === null || key.startsWith("temp") || key.startsWith("__")) {
                continue;
            }
            html += `<th scope="col">${header_configs[key]}</th>`;
        }

        document.getElementById("header_column_id").innerHTML = html;
    }

    var radios = document.querySelectorAll('input[type=radio][name="options_filter"]');

    async function changeHandler(event) {
        if (this.value === "NEW") {
            let data = await loadData();
            renderDataTale(data.dataList, "NEW");
        }

        if (this.value === "ERROR") {
            let data = await loadData();
            renderDataTale(data.dataList, "ERROR");
        }

        if (this.value === "UPDATE") {
            let data = await loadData();
            renderDataTale(data.dataList, "UPDATE");
        }

        if (this.value === "ALL") {
            let data = await loadData();
            renderDataTale(data.dataList);
        }
    }

    Array.prototype.forEach.call(radios, function (radio) {
        radio.addEventListener('change', changeHandler);
    });
});

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

async function get_start_status() {
    let response = await new Promise((resolve, reject) => chrome.storage.local.get("import_status", function (res) {
        resolve(res);
    }));

    let import_status = null;
    if (response && response.hasOwnProperty("import_status")) {
        import_status = response.import_status;
    }
    return import_status;
}

function copyTextToClipboard(text) {
    navigator.clipboard.writeText(text).then(function () {
        alert("Copy success\n" + text);
    }, function (err) {
        console.error('Async: Could not copy text: ', err);
    });
}