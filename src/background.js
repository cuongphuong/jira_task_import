/*global chrome*/

/**
 * author: CuongPV10
 * 2022/04/10
 */

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {

    if (message.req === "load") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            var tab = tabs[0];
            chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: false },
                files: ["static/js/read-excel-file.min.js", '/function/bug/collect.min.js'],
            });
        });
        sendResponse();
    }

    if (message.req === "close_this_tab") {
        chrome.tabs.remove(sender.tab.id);
        sendResponse();
    }

    if (message.req === "notif") {
        chrome.notifications.create('', message.options);
        sendResponse();
    }

    if (message.req === "incorrect_user") {
        chrome.tabs.remove(sender.tab.id);
        chrome.tabs.create({ active: true, url: '/function/settings/settings.html' }, null);
        chrome.notifications.create('', {
            title: 'Import',
            message: 'User or password is incorrect!',
            iconUrl: '/img/error.png',
            type: 'basic'
        });
        sendResponse();
    }

    if (message.req === "process_data") {
        (async () => {
            const payload = await process_data(message.data);
            sendResponse({ payload });
        })();
        return true; // keep the messaging channel open for sendResponse
    }
});

/******************************************BUG VALIDATE*************************************************************/

async function process_data(dataList) {
    let configs = await get_settings();
    if (!configs) return;
    await loginJira(configs);

    let checked_list = [];
    let col_index = configs.bug.temp_col_index;
    for (let i = 0; i < dataList.length; i++) {
        let item = dataList[i];

        let api_issue = await fetch(`${configs.common.jira_base_url}/rest/api/2/issue/${item.temp_result_issue_key}`, {
            method: "GET"
        }).then(res => res.json());

        // SET ID
        item["temp_id"] = get_response_id(api_issue, "id");

        // SET CHECKED STATUS
        let status = await validate_data(item, api_issue, configs);
        item["temp_checked_status"] = status;

        checked_list.push(item);
    }
    console.log(checked_list);
    return checked_list;
}

async function validate_data(issue, response, configs) {
    let rsl_status = [];
    let rsl_msg = [];

    // Kiểm tra tồn tại issue key
    if (nullToDefault(issue.temp_result_issue_key) !== "") {
        let response = await fetch(`${configs.common.jira_base_url}/rest/api/2/issue/${issue.temp_result_issue_key}`, {
            method: "GET"
        }).then(res => res.json());

        let isUpdate = false;

        if (response.hasOwnProperty("errorMessages")) {
            // Có issue key mà check không tồn tại thì báo lỗi
            rsl_status.push("ERROR");
            rsl_msg.push("Issue key is not existed");
        } else {
            // Có issue key tồn tại thì check data
            let res_fields = response.fields;
            if (!check_mapping_data(issue, res_fields, configs)) {
                // Nếu data không map nhau thì vaidate và update lại data trên jira
                let msg = check_require_data(configs, issue);
                if (msg.length > 0) {
                    rsl_status.push("ERROR");
                    rsl_msg = rsl_msg.concat(msg);
                } else {
                    isUpdate = true;
                    rsl_status.push("UPDATE_BASE_DATA");
                }
            }
            // Kiểm tra trạng thái của BUG
            let update_status = remake_bug_status(issue.temp_issue_status);
            if (update_status !== get_response_id(res_fields.status, "name")) {
                if (update_status === "Open"
                    || update_status === "Reopened"
                    || update_status === "Cancelled") {
                    rsl_status.push("CHANGE_STATUS");
                    isUpdate = true;
                } else {
                    let msg = resolve_check_require(configs, issue);
                    if (msg.length > 0) {
                        rsl_status.push("ERROR")
                        rsl_msg = rsl_msg.concat(msg);
                    } else {
                        rsl_status.push("CHANGE_STATUS");
                        isUpdate = true;
                    }
                }
            }
        }

        if (!isUpdate) {
            rsl_status.push("IGNORE");
        }
    } else {
        // Kiểm tra require data
        let msg = check_require_data(configs, issue);
        let isCreate = false;

        if (msg.length > 0) {
            // Data invalid
            rsl_status.push("ERROR")
            rsl_msg = rsl_msg.concat(msg);
        } else {
            rsl_status.push("NEW");
            isCreate = true;
        }

        // Kiểm tra trạng thái của BUG
        let update_status = remake_bug_status(issue.temp_issue_status);
        if (update_status === "Cancelled") {
            rsl_status.push("CHANGE_STATUS");
            isCreate = true;
        } else if (update_status === "Resolved" || update_status === "Closed") {
            let msg = resolve_check_require(configs, issue);
            if (msg.length > 0) {
                rsl_status.push("ERROR")
                rsl_msg = rsl_msg.concat(msg);
            } else {
                rsl_status.push("CHANGE_STATUS");
                isCreate = true;
            }
        }

        if (!isCreate) {
            rsl_status.push("IGNORE");
        }
    }

    return { rsl_status, rsl_msg }
}

function remake_bug_status(str) {
    // "name": "Open",
    // "name": "Reopened",
    // "name": "In Progress",
    // "name": "Resolved",
    // "name": "Closed",
    // "name": "Cancelled",
    if (!str || str.trim() === "") return "Open";
    if (str.toLowerCase() === "open") return "Open";
    if (str.toLowerCase() === "reopened") return "Reopened";
    if (str.toLowerCase() === "in progress") return "In Progress";
    if (str.toLowerCase() === "resolved") return "Resolved";
    if (str.toLowerCase() === "closed") return "Closed";
    if (str.toLowerCase() === "cancelled") return "Cancelled";
    return "Open";
}

function check_mapping_data(issue, res_fields, configs) {
    const qc_activity = configs.bug.qc_activity;
    const priority = configs.bug.priority;
    const defect_origin = configs.bug.defect_origin;
    const severity = configs.bug.severity;
    const role = configs.bug.role;
    const defect_type = configs.bug.defect_type;
    const cause_category = configs.bug.cause_category;

    const severity_id = get_key_from_name(severity, issue.severity, configs);
    const role_id = get_key_from_name(role, issue.role, configs);
    const defect_type_id = get_key_from_name(defect_type, issue.defect_type, configs);
    const cause_category_id = get_key_from_name(cause_category, issue.cause_category, configs);
    const defect_origin_id = get_key_from_name(defect_origin, issue.defect_origin, configs);
    const priority_id = get_key_from_name(priority, issue.priority, configs);
    const qc_activity_id = get_key_from_name(qc_activity, issue.qc_activity, configs);

    if (nullToDefault(issue.description) !== res_fields.description) return false;
    if (nullToDefault(defect_origin_id, configs.bug.defect_origin_default) !== get_response_id(res_fields.customfield_11401, "id")) return false;
    if (nullToDefault(priority_id, configs.bug.priority_default) !== get_response_id(res_fields.priority, "id")) return false;
    if (nullToDefault(severity_id, configs.bug.severity_default) !== get_response_id(res_fields.customfield_10303, "id")) return false;
    if (nullToDefault(qc_activity_id, configs.bug.qc_activity_default) !== get_response_id(res_fields.customfield_10302, "id")) return false;
    if (nullToDefault(issue.cause_analysis, null) !== res_fields.customfield_10601) return false;
    if (nullToDefault(issue.corrective_action, null) !== res_fields.customfield_10603) return false;
    if (nullToDefault(issue.assigner, null) !== get_response_id(res_fields.assignee, "name")) return false;
    if (nullToDefault(role_id, configs.bug.role_default) !== get_response_id(res_fields.customfield_11405, "id")) return false;
    if (nullToDefault(issue.reporter, null) !== get_response_id(res_fields.reporter, "name")) return false;
    if (get_date_str(issue.plan_start_date) !== get_date_str(res_fields.customfield_10203)) return false;
    if (nullToDefault(issue.original_estimate, null) !== get_response_id(res_fields.timetracking, "originalEstimate")) return false;
    if (nullToDefault(issue.remaining_estimate, null) !== get_response_id(res_fields.timetracking, "remainingEstimate")) return false;
    if (get_date_str(issue.due_date) !== get_date_str(res_fields.duedate)) return false;
    if (nullToDefault(defect_type_id, configs.bug.defect_type_default) !== get_response_id(res_fields.customfield_10301, "id")) return false;
    if (nullToDefault(cause_category_id, configs.bug.cause_category_default) !== get_response_id(res_fields.customfield_10300, "id")) return false;

    return true;
}

function get_response_id(object, field_name) {
    if (!object) return null;
    if (!object.hasOwnProperty(field_name)) return null;
    return object[field_name];
}

function get_date_str(datestr) {
    let date = new Date(datestr);
    return date.getDate() + "/" + date.getMonth() + "/" + date.getFullYear();
}

function check_require_data(configs, issue) {
    let msg = [];
    if (nullToDefault(issue.description) === "") {
        msg.push("description is empty");
    }

    const qc_activity = configs.bug.qc_activity;
    let qc_activity_id = get_key_from_name(qc_activity, issue.qc_activity, configs);

    const isCheckedQActivity = !configs.bug.qc_activity_default;
    if (nullToDefault(qc_activity_id) === "" && isCheckedQActivity) {
        msg.push("qc_activity is empty");
    }

    if (nullToDefault(issue.assigner) === "") {
        msg.push("assigner is empty");
    }

    if (nullToDefault(issue.reporter) === "") {
        msg.push("reporter is empty");
    }

    return msg;
}

function resolve_check_require(configs, issue) {
    let msg = [];

    // Defect Type
    const defect_type = configs.bug.defect_type;
    const defect_type_id = get_key_from_name(defect_type, issue.defect_type, configs);

    const isdefect_type = !configs.bug.defect_type_default;
    if (nullToDefault(defect_type_id) === "" && isdefect_type) {
        msg.push("defect_type is empty");
    }


    // Cause Category
    const cause_category = configs.bug.cause_category;
    const cause_category_id = get_key_from_name(cause_category, issue.cause_category, configs);

    const iscause_category = !configs.bug.cause_category_default;
    if (nullToDefault(cause_category_id) === "" && iscause_category) {
        msg.push("cause_category is empty");
    }

    return msg;
}

function nullToDefault(str, default_str) {
    if (str && str.trim() !== "") return str;
    if (default_str === null) return default_str;
    if (default_str) return default_str;
    return "";
}

async function loginJira(configs) {
    // Login
    let baseUrl = configs.common.jira_base_url;
    let userName = configs.common.account.username;
    let password = configs.common.account.password;
    await fetch(`${baseUrl}/login.jsp?os_username=${userName}&os_password=${password}`, { method: "POST" });
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

function get_key_from_name(object, per, configs) {
    if (!per) return "";
    return Object.keys(object).find(key => object[key] === per);
}