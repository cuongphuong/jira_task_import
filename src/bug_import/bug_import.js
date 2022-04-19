/**
 * author: CuongPV10
 * 2022/04/10
 */

async function init() {
    let configs = await get_settings();
    if (!configs) return;

    let currentUrl = window.location.href;
    let baseUrl = configs.common.jira_base_url;

    // Not jira page
    if (!currentUrl.includes(baseUrl)) return;

    // Check start status
    let import_status = await get_start_status();
    let status = import_status && import_status.status ? import_status.status : "wait";
    if (status !== "ready") return;

    chrome.storage.local.set({ "import_status": { status: "ready", is_first_time: false } }, function () {
        console.log('Value is set to ', "ready", "is_first_time", false);
    });

    let is_first_time = import_status.is_first_time;
    if (is_first_time) {
        // Login
        let userName = configs.common.account.username;
        let password = configs.common.account.password;
        await fetch(`${baseUrl}/login.jsp?os_username=${userName}&os_password=${password}`, { method: "POST" });

        // Redirect to dashboard
        window.location.href = baseUrl;
        return;
    }

    let userInf = document.getElementById("header-details-user-fullname");
    if (!userInf) {
        chrome.runtime.sendMessage({ req: "incorrect_user" }, function (response) { console.log(response); });
        return;
    }

    // Start import issue
    createIssue(configs);
}

async function createIssue(configs) {

    // Make import view
    makeView();

    const data = await loadData();
    let issueList = data.dataList;
    let result = "";


    for (let i = 0; i < issueList.length; i++) {
        let issue = issueList[i];

        if (issue.temp_checked_status.rsl_status.includes("ERROR") ||
            issue.temp_checked_status.rsl_status.includes("IGNORE")) {
            issue.temp_imported_status = "IGNORE";
            result += `"${issue.temp_result_issue_key}"\t"${issue.temp_checked_status.rsl_msg.join(", ")}"\n`;

            // Display view
            document.getElementById("progress_id").innerHTML = `${i + 1}/${issueList.length}`;
            continue;
        }

        let token = getCookie("atlassian.xsrf.token");
        let issueId = issue.temp_id;
        let error_msgs = [];

        /* THÔNG TIN ISSUE *******************************************************************/

        /* Create issue */
        if (issue.temp_checked_status.rsl_status.includes("NEW")) {
            let res = await requestCreateIssue(configs, token, issue).then(res => res.json());
            if (res.status === 200 && res.hasOwnProperty("createdIssueDetails")) {
                issueId = res.createdIssueDetails.id;
                issue.temp_result_issue_key = res.createdIssueDetails.key;
            } else {
                error_msgs.push(JSON.stringify(res));
            }
        }

        /* Update thông tin cơ bản  */
        if (issue.temp_checked_status.rsl_status.includes("UPDATE_BASE_DATA")) {
            let res = await updateIssue(configs, token, issueId, issue).then(res => {
                if (res.status !== 200) {
                    return res.json()
                } else {
                    return { status: 200 }
                }
            });

            if (res.hasOwnProperty("errorMessages") || res.hasOwnProperty("errors")) {
                error_msgs.push(JSON.stringify(res));
            }
        }

        /* TRẠNG THÁI ISSUE *****************************************************************/

        /* Update status */
        if (issue.temp_checked_status.rsl_status.includes("CHANGE_STATUS")) {
            if (remake_bug_status(issue.temp_issue_status) === "Open" || remake_bug_status(issue.temp_issue_status) === "Reopened") {
                await reOpenIssue(configs, token, issueId);
            }

            if (remake_bug_status(issue.temp_issue_status) === "In Progress") {
                await startIssue(configs, token, issueId);
            }

            if (remake_bug_status(issue.temp_issue_status) === "Resolved") {
                await reOpenIssue(configs, token, issueId);
                let res = await resolveIssue(configs, token, issueId, issue).then(res => res.text());
                if (res.includes("<form action=")) {
                    error_msgs.push("Resolve failed");
                }
            }

            if (remake_bug_status(issue.temp_issue_status) === "Closed") {
                await reOpenIssue(configs, token, issueId);
                let res_rs = await resolveIssue(configs, token, issueId, issue).then(res => res.text());
                if (res_rs.includes("<form action=")) {
                    error_msgs.push("Resolve failed");
                }

                let res_cl = await closeIssue(configs, token, issueId, issue).then(res => res.text());
                if (res_cl.includes("<form action=")) {
                    error_msgs.push("Close failed");
                }
            }

            if (remake_bug_status(issue.temp_issue_status) === "Cancelled") {
                await reOpenIssue(configs, token, issueId);
                let res = await cancelIssue(configs, token, issueId, issue).then(res => res.text());
                if (res.includes("<form action=")) {
                    error_msgs.push("Cancel failed");
                }
            }
        }


        // Checked status
        if (error_msgs.length > 0) {
            issue.temp_imported_status = "ERROR";
            issue.temp_checked_status.rsl_status = ["ERROR"];
            issue.temp_checked_status.rsl_msg = error_msgs;

            result += `"${issue.temp_result_issue_key}"\t"${JSON.stringify(error_msgs)}"\n`;
        } else {
            issue.temp_imported_status = "OK";
            issue.temp_checked_status.rsl_status = ["OK"];
            issue.temp_checked_status.rsl_msg = ["OK"];

            result += `"${issue.temp_result_issue_key}"\t"OK"\n`;
        }

        // Display view
        document.getElementById("progress_id").innerHTML = `${i + 1}/${issueList.length}`;
    }
    console.log(result);

    chrome.storage.local.set({ "import_status": { status: "done", is_first_time: false, result: result } }, function () {
        console.log('Value is set to ', "done", "is_first_time", false);
        chrome.runtime.sendMessage({ req: "close_this_tab" }, function (response) { console.log(response); });
        chrome.tabs.create({ active: true, url: 'bug/bug_list.html' }, null);
    });
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

function requestCreateIssue(configs, token, issue) {
    let bodyReq = createBodyRequestIssue(issue, token, configs);
    return fetch(configs.common.jira_base_url + "/secure/QuickCreateIssue.jspa?decorator=none", {
        headers: {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
        },
        body: bodyReq,
        method: "POST"
    });
}

function createBodyRequestIssue(issue, token, configs) {
    const project_id = configs.common.project_id;
    const bug_product_id = configs.common.bug_product_id;

    // Config list
    const qc_activity = configs.bug.qc_activity;
    const priority = configs.bug.priority;
    const defect_origin = configs.bug.defect_origin;
    const severity = configs.bug.severity;
    const role = configs.bug.role;
    const defect_type = configs.bug.defect_type;
    const cause_category = configs.bug.cause_category;

    const qc_activity_default = configs.bug.qc_activity_default;
    const priority_default = configs.bug.priority_default;
    const defect_origin_default = configs.bug.defect_origin_default;
    const severity_default = configs.bug.severity_default;
    const role_default = configs.bug.role_default;
    const defect_type_default = configs.bug.defect_type_default;
    const cause_category_default = configs.bug.cause_category_default;

    let severity_id = severity_default ? severity_default : get_key_from_name(severity, issue.severity, configs);
    let role_id = role_default ? role_default : get_key_from_name(role, issue.role, configs);
    let defect_type_id = defect_type_default ? defect_type_default : get_key_from_name(defect_type, issue.defect_type, configs);
    let cause_category_id = cause_category_default ? cause_category_default : get_key_from_name(cause_category, issue.cause_category, configs);
    let defect_origin_id = defect_origin_default ? defect_origin_default : get_key_from_name(defect_origin, issue.defect_origin, configs);
    let priority_id = priority_default ? priority_default : get_key_from_name(priority, issue.priority, configs);
    let qc_activity_id = qc_activity_default ? qc_activity_default : get_key_from_name(qc_activity, issue.qc_activity, configs);
    let summary = make_summary_from_desscription(issue.description);

    let bodyDt = "";
    bodyDt += `pid=${project_id}`;
    bodyDt += `&formToken=`;
    bodyDt += `&issuetype=1`; // Require
    bodyDt += `&atl_token=${nullToDefault(token)}`;
    bodyDt += `&summary=${nullToDefault(summary)}`; // Require
    bodyDt += `&customfield_12610=${bug_product_id}`; // Require
    bodyDt += `&description=${nullToDefault(issue.description)}`; // Require
    bodyDt += `&customfield_10600=`;
    bodyDt += `&customfield_11401=${nullToDefault(defect_origin_id)}`;
    bodyDt += `&priority=${nullToDefault(priority_id, 4)}`;
    bodyDt += `&customfield_10303=${nullToDefault(severity_id, "-1")}`;
    bodyDt += `&customfield_10302=${nullToDefault(qc_activity_id)}`; // Require
    bodyDt += `&customfield_10601=${nullToDefault(issue.cause_analysis)}`;
    bodyDt += `&customfield_10602=`;
    bodyDt += `&customfield_10603=${nullToDefault(issue.corrective_action)}`;
    bodyDt += `&customfield_10604=`;
    bodyDt += `&customfield_12644=-1`;
    bodyDt += `&environment=`;
    bodyDt += `&assignee=${nullToDefault(issue.assigner)}`; // Require
    bodyDt += `&customfield_11405=${nullToDefault(role_id, "-1")}`;
    bodyDt += `&reporter=${nullToDefault(issue.reporter)}`; // Require
    bodyDt += `&customfield_10203=${get_str_date(issue.plan_start_date, "DD/MMM/YY LT")}`;
    bodyDt += `&timetracking_originalestimate=${nullToDefault(issue.original_estimate)}`;
    bodyDt += `&timetracking_remainingestimate=${nullToDefault(issue.remaining_estimate)}`;
    bodyDt += `&isCreateIssue=true`;
    bodyDt += `&hasWorkStarted=`;
    bodyDt += `&customfield_13100=`;
    bodyDt += `&customfield_13101=-1`;
    bodyDt += `&customfield_13102=`;
    bodyDt += `&customfield_13205=`;
    bodyDt += `&duedate=${get_str_date(issue.due_date, "DD/MMM/YY")}`;
    bodyDt += `&dnd-dropzone=`;
    bodyDt += `&customfield_10000=`;
    bodyDt += `&customfield_11403=`;
    bodyDt += `&customfield_11406=`;
    bodyDt += `&issuelinks=issuelinks`;
    bodyDt += `&issuelinks-linktype=blocks`;
    bodyDt += `&customfield_12901=`;
    bodyDt += `&security=11100`;
    bodyDt += `&customfield_10301=${nullToDefault(defect_type_id, "-1")}`;
    bodyDt += `&customfield_10300=${nullToDefault(cause_category_id, "-1")}`;
    bodyDt += `&customfield_18403=-1`;
    bodyDt += `&customfield_10202=`;
    bodyDt += `&customfield_10200=`;
    bodyDt += `&customfield_10201=`;
    bodyDt += `&fieldsToRetain=project`;
    bodyDt += `&fieldsToRetain=issuetype`;
    bodyDt += `&fieldsToRetain=components`;
    bodyDt += `&fieldsToRetain=customfield_12610`;
    bodyDt += `&fieldsToRetain=customfield_10600`;
    bodyDt += `&fieldsToRetain=fixVersions`;
    bodyDt += `&fieldsToRetain=customfield_11401`;
    bodyDt += `&fieldsToRetain=priority`;
    bodyDt += `&fieldsToRetain=customfield_10303`;
    bodyDt += `&fieldsToRetain=customfield_10302`;
    bodyDt += `&fieldsToRetain=versions`;
    bodyDt += `&fieldsToRetain=customfield_10601`;
    bodyDt += `&fieldsToRetain=customfield_10602`;
    bodyDt += `&fieldsToRetain=customfield_10603`;
    bodyDt += `&fieldsToRetain=customfield_10604`;
    bodyDt += `&fieldsToRetain=customfield_12644`;
    bodyDt += `&fieldsToRetain=environment`;
    bodyDt += `&fieldsToRetain=assignee`;
    bodyDt += `&fieldsToRetain=customfield_11405`;
    bodyDt += `&fieldsToRetain=reporter`;
    bodyDt += `&fieldsToRetain=customfield_10203`;
    bodyDt += `&fieldsToRetain=customfield_13100`;
    bodyDt += `&fieldsToRetain=customfield_13101`;
    bodyDt += `&fieldsToRetain=customfield_13102`;
    bodyDt += `&fieldsToRetain=customfield_13205`;
    bodyDt += `&fieldsToRetain=duedate`;
    bodyDt += `&fieldsToRetain=labels`;
    bodyDt += `&fieldsToRetain=customfield_10000`;
    bodyDt += `&fieldsToRetain=customfield_11403`;
    bodyDt += `&fieldsToRetain=customfield_11406`;
    bodyDt += `&fieldsToRetain=customfield_11829`;
    bodyDt += `&fieldsToRetain=issuelinks`;
    bodyDt += `&fieldsToRetain=customfield_10001`;
    bodyDt += `&fieldsToRetain=customfield_12901`;
    bodyDt += `&fieldsToRetain=security`;
    bodyDt += `&fieldsToRetain=customfield_10301`;
    bodyDt += `&fieldsToRetain=customfield_10300`;
    bodyDt += `&fieldsToRetain=customfield_18403`;
    bodyDt += `&fieldsToRetain=customfield_10202`;
    bodyDt += `&fieldsToRetain=customfield_10200`;
    bodyDt += `&fieldsToRetain=customfield_10201`;
    bodyDt += `&fieldsToRetain=customfield_18304`;

    return bodyDt;
}


function get_str_date(date_str, format) {
    let date = new Date();

    if (date_str && date_str.trim() !== "") {
        date = new Date(date_str);
    }
    return moment(date).format(format);
}

function make_summary_from_desscription(description) {
    if (description.length <= 10) {
        let summary = description.replace(/(?:\r\n|\r|\n)/g, ' - ');
        return summary;
    }

    // Get first row
    let array = description.trim().split(/\r?\n/);
    return array[0];
}

function get_key_from_name(object, per, configs) {
    if (!per) return "";
    return Object.keys(object).find(key => object[key] === per);
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
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

function nullToDefault(str, default_str) {
    if (str && str.trim() !== "") return encodeURIComponent(str);
    if (default_str) return default_str;
    return "";
}

function makeView() {
    let imageUrl = "https://raw.githubusercontent.com/cuongphuong/jira_worklog/master/img/loadding.gif";

    let html = "";
    html = html + '<div style="position: fixed; bottom: 0; top: 0; right: 0; left: 0; z-index: 999; display: flex; justify-content: center; align-items: center; height: 99%; border: 3px solid green; background: #ddd; opacity: 0.5">';
    html = html + `   <img width="50%" src="${imageUrl}"/>`;
    html = html + '</div>';
    html = html + '<div style="position: fixed; bottom: 0; top: 0; right: 0; left: 0; z-index: 999; display: flex; justify-content: center; align-items: center; height: 100%;">';
    html = html + '    <p id="progress_id" style="color: red; font-size: 18em; padding:0; margin: 0; text-align: center">0/0</p>';
    html = html + '</div>';

    document.getElementById("page").innerHTML += html;
}


// API

function startIssue(configs, token, issueId) {
    fetch(`${configs.common.jira_base_url}/secure/WorkflowUIDispatcher.jspa?id=${issueId}&action=4&atl_token=${token}&decorator=dialog&inline=true&_=1650185614805`, {
        "headers": {
            "accept": "*/*",
        },
        "body": null,
        "method": "GET",
    });
}

function reOpenIssue(configs, token, issueId) {

    // Reopen
    return fetch(`${configs.common.jira_base_url}/secure/WorkflowUIDispatcher.jspa?id=${issueId}&action=751&atl_token=${token}&decorator=dialog&inline=true&_=1650126105103`, {
        "headers": {
            "accept": "*/*"
        },
        "body": null,
        "method": "GET"
    });
}

function resolveIssue(configs, token, issueId, issue) {
    // Config list
    const qc_activity = configs.bug.qc_activity;
    const defect_origin = configs.bug.defect_origin;
    const severity = configs.bug.severity;
    const defect_type = configs.bug.defect_type;
    const cause_category = configs.bug.cause_category;

    const qc_activity_default = configs.bug.qc_activity_default;
    const defect_origin_default = configs.bug.defect_origin_default;
    const severity_default = configs.bug.severity_default;
    const defect_type_default = configs.bug.defect_type_default;
    const cause_category_default = configs.bug.cause_category_default;

    let severity_id = severity_default ? severity_default : get_key_from_name(severity, issue.severity, configs);
    let defect_type_id = defect_type_default ? defect_type_default : get_key_from_name(defect_type, issue.defect_type, configs);
    let cause_category_id = cause_category_default ? cause_category_default : get_key_from_name(cause_category, issue.cause_category, configs);
    let defect_origin_id = defect_origin_default ? defect_origin_default : get_key_from_name(defect_origin, issue.defect_origin, configs);
    let qc_activity_id = qc_activity_default ? qc_activity_default : get_key_from_name(qc_activity, issue.qc_activity, configs);

    let bodyReq = "";
    bodyReq += `inline=true`;
    bodyReq += `&decorator=dialog`;
    bodyReq += `&action=731`;
    bodyReq += `&id=${issueId}`;
    bodyReq += `&viewIssueKey=`;
    bodyReq += `&resolution=1`; // Không fix default
    bodyReq += `&customfield_10303=${nullToDefault(severity_id, "-1")}`;
    bodyReq += `&customfield_10302=${nullToDefault(qc_activity_id)}`;
    bodyReq += `&customfield_18403=-1`;
    bodyReq += `&customfield_10301=${nullToDefault(defect_type_id, "-1")}`;
    bodyReq += `&customfield_11401=${nullToDefault(defect_origin_id)}`;
    bodyReq += `&customfield_10300=${nullToDefault(cause_category_id, "-1")}`;
    bodyReq += `&customfield_10601=${nullToDefault(issue.cause_analysis)}`;
    bodyReq += `&customfield_12644=-1`;
    bodyReq += `&customfield_10603=${nullToDefault(issue.corrective_action)}`;
    bodyReq += `&customfield_10602=`;
    bodyReq += `&customfield_10604=`;
    bodyReq += `&description=${nullToDefault(issue.description)}`;
    bodyReq += `&customfield_10600=`;
    bodyReq += `&assignee=${nullToDefault(issue.assigner)}`;
    bodyReq += `&dnd-dropzone=`;
    bodyReq += `&customfield_11406=`;
    bodyReq += `&customfield_13100=`;
    bodyReq += `&customfield_13101=-1`;
    bodyReq += `&customfield_13102=`;
    bodyReq += `&customfield_13205=`;
    bodyReq += `&customfield_12901=`;
    bodyReq += `&comment=`;
    bodyReq += `&commentLevel=`;
    bodyReq += `&atl_token=${token}`;

    // Resolve
    return fetch(`${configs.common.jira_base_url}/secure/CommentAssignIssue.jspa?atl_token=${token}`, {
        "headers": {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
        },
        "body": bodyReq,
        "method": "POST",
    });
}

function closeIssue(configs, token, issueId, issue) {
    // Config list
    const priority = configs.bug.priority;
    const defect_origin = configs.bug.defect_origin;
    const cause_category = configs.bug.cause_category;

    const priority_default = configs.bug.priority_default;
    const defect_origin_default = configs.bug.defect_origin_default;
    const cause_category_default = configs.bug.cause_category_default;

    let cause_category_id = cause_category_default ? cause_category_default : get_key_from_name(cause_category, issue.cause_category, configs);
    let defect_origin_id = defect_origin_default ? defect_origin_default : get_key_from_name(defect_origin, issue.defect_origin, configs);
    let priority_id = priority_default ? priority_default : get_key_from_name(priority, issue.priority, configs);

    let bodyReq = "";
    bodyReq += `inline=true`;
    bodyReq += `&decorator=dialog`;
    bodyReq += `&action=741`;
    bodyReq += `&id=${issueId}`;
    bodyReq += `&viewIssueKey=`;
    bodyReq += `&resolution=6`;
    bodyReq += `&description=${nullToDefault(issue.description)}`;
    bodyReq += `&customfield_10600=`;
    bodyReq += `&customfield_10300=${nullToDefault(cause_category_id, "-1")}`;
    bodyReq += `&customfield_12644=-1`;
    bodyReq += `&customfield_11938=`;
    bodyReq += `&assignee=${nullToDefault(issue.assigner)}`;
    bodyReq += `&reporter=${nullToDefault(issue.reporter)}`;
    bodyReq += `&priority=${nullToDefault(priority_id, 4)}`;
    bodyReq += `&customfield_11401=${nullToDefault(defect_origin_id)}`;
    bodyReq += `&customfield_13100=`;
    bodyReq += `&customfield_13101=-1`;
    bodyReq += `&customfield_13102=`;
    bodyReq += `&customfield_13205=`;
    bodyReq += `&duedate=${get_str_date(issue.due_date, "DD/MMM/YY")}`;
    bodyReq += `&customfield_12901=`;
    bodyReq += `&comment=`;
    bodyReq += `&commentLevel=`;
    bodyReq += `&atl_token=${token}`;

    // Close
    return fetch(`${configs.common.jira_base_url}/secure/CommentAssignIssue.jspa?atl_token=${token}`, {
        "headers": {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
        },
        "body": bodyReq,
        "method": "POST",
    });
}

function cancelIssue(configs, token, issueId, issue) {
    const qc_activity = configs.bug.qc_activity;
    const defect_origin = configs.bug.defect_origin;
    const severity = configs.bug.severity;
    const defect_type = configs.bug.defect_type;
    const cause_category = configs.bug.cause_category;

    const qc_activity_default = configs.bug.qc_activity_default;
    const defect_origin_default = configs.bug.defect_origin_default;
    const severity_default = configs.bug.severity_default;
    const defect_type_default = configs.bug.defect_type_default;
    const cause_category_default = configs.bug.cause_category_default;

    let severity_id = severity_default ? severity_default : get_key_from_name(severity, issue.severity, configs);
    let defect_type_id = defect_type_default ? defect_type_default : get_key_from_name(defect_type, issue.defect_type, configs);
    let cause_category_id = cause_category_default ? cause_category_default : get_key_from_name(cause_category, issue.cause_category, configs);
    let defect_origin_id = defect_origin_default ? defect_origin_default : get_key_from_name(defect_origin, issue.defect_origin, configs);
    let qc_activity_id = qc_activity_default ? qc_activity_default : get_key_from_name(qc_activity, issue.qc_activity, configs);

    let bodyReq = "";
    bodyReq += `inline=true`;
    bodyReq += `&decorator=dialog`;
    bodyReq += `&action=761`;
    bodyReq += `&id=${issueId}`;
    bodyReq += `&viewIssueKey=`;
    bodyReq += `&resolution=2`;
    bodyReq += `&customfield_10303=${nullToDefault(severity_id, "-1")}`;
    bodyReq += `&customfield_10302=${nullToDefault(qc_activity_id)}`;
    bodyReq += `&customfield_18403=-1`;
    bodyReq += `&customfield_10301=${nullToDefault(defect_type_id, "-1")}`;
    bodyReq += `&customfield_11401=${nullToDefault(defect_origin_id)}`;
    bodyReq += `&customfield_10300=${nullToDefault(cause_category_id, "-1")}`;
    bodyReq += `&customfield_10601=${nullToDefault(issue.cause_analysis)}`;
    bodyReq += `&customfield_12644=-1`;
    bodyReq += `&customfield_10603=${nullToDefault(issue.corrective_action)}`;
    bodyReq += `&customfield_10602=`;
    bodyReq += `&customfield_10604=`;
    bodyReq += `&description=${nullToDefault(issue.description)}`;
    bodyReq += `&customfield_10600=`;
    bodyReq += `&assignee=${nullToDefault(issue.assigner)}`;
    bodyReq += `&dnd-dropzone=`;
    bodyReq += `&customfield_11406=`;
    bodyReq += `&customfield_13100=`;
    bodyReq += `&customfield_13101=-1`;
    bodyReq += `&customfield_13102=`;
    bodyReq += `&customfield_13205=`;
    bodyReq += `&customfield_12901=`;
    bodyReq += `&comment=`;
    bodyReq += `&commentLevel=`;
    bodyReq += `&atl_token=${token}`;

    // Cancel
    return fetch(`${configs.common.jira_base_url}/secure/CommentAssignIssue.jspa?atl_token=${token}`, {
        "headers": {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
        },
        "body": bodyReq,
        "method": "POST",
    });
}

function updateIssue(configs, token, issueId, issue) {
    const bug_product_id = configs.common.bug_product_id;

    // Config list
    const qc_activity = configs.bug.qc_activity;
    const priority = configs.bug.priority;
    const defect_origin = configs.bug.defect_origin;
    const severity = configs.bug.severity;
    const role = configs.bug.role;
    const defect_type = configs.bug.defect_type;
    const cause_category = configs.bug.cause_category;

    const qc_activity_default = configs.bug.qc_activity_default;
    const priority_default = configs.bug.priority_default;
    const defect_origin_default = configs.bug.defect_origin_default;
    const severity_default = configs.bug.severity_default;
    const role_default = configs.bug.role_default;
    const defect_type_default = configs.bug.defect_type_default;
    const cause_category_default = configs.bug.cause_category_default;

    let severity_id = severity_default ? severity_default : get_key_from_name(severity, issue.severity, configs);
    let role_id = role_default ? role_default : get_key_from_name(role, issue.role, configs);
    let defect_type_id = defect_type_default ? defect_type_default : get_key_from_name(defect_type, issue.defect_type, configs);
    let cause_category_id = cause_category_default ? cause_category_default : get_key_from_name(cause_category, issue.cause_category, configs);
    let defect_origin_id = defect_origin_default ? defect_origin_default : get_key_from_name(defect_origin, issue.defect_origin, configs);
    let priority_id = priority_default ? priority_default : get_key_from_name(priority, issue.priority, configs);
    let qc_activity_id = qc_activity_default ? qc_activity_default : get_key_from_name(qc_activity, issue.qc_activity, configs);
    let summary = make_summary_from_desscription(issue.description);

    // Edit
    let bodyReq = "";
    bodyReq += `id=8128116`;
    bodyReq += `&atl_token=${token}`;
    bodyReq += `&formToken=99a046347bb4107fee8996d16a212c788b78c85c`;
    bodyReq += `&issuetype=1`;
    bodyReq += `&summary=${nullToDefault(summary)}`;
    bodyReq += `&customfield_12610=${bug_product_id}`;
    bodyReq += `&description=${nullToDefault(issue.description)}`;
    bodyReq += `&customfield_10600=`;
    bodyReq += `&customfield_11401=${nullToDefault(defect_origin_id)}`;
    bodyReq += `&priority=${nullToDefault(priority_id, 4)}`;
    bodyReq += `&customfield_10303=${nullToDefault(severity_id, "-1")}`;
    bodyReq += `&customfield_10302=${nullToDefault(qc_activity_id)}`; // Require
    bodyReq += `&customfield_10601=${nullToDefault(issue.cause_analysis)}`;
    bodyReq += `&customfield_10602=`;
    bodyReq += `&customfield_10603=${nullToDefault(issue.corrective_action)}`;
    bodyReq += `&customfield_10604=`;
    bodyReq += `&customfield_12644=-1`;
    bodyReq += `&environment=`;
    bodyReq += `&assignee=${nullToDefault(issue.assigner)}`; // Require
    bodyReq += `&customfield_11405=${nullToDefault(role_id, "-1")}`;
    bodyReq += `&reporter=${nullToDefault(issue.reporter)}`; // Require
    bodyReq += `&customfield_10203=${get_str_date(issue.plan_start_date, "DD/MMM/YY LT")}`;
    bodyReq += `&timetracking_originalestimate=${nullToDefault(issue.original_estimate)}`;
    bodyReq += `&timetracking_remainingestimate=${nullToDefault(issue.remaining_estimate)}`;
    bodyReq += `&isCreateIssue=`;
    bodyReq += `&hasWorkStarted=`;
    bodyReq += `&customfield_13100=`;
    bodyReq += `&customfield_13101=-1`;
    bodyReq += `&customfield_13102=`;
    bodyReq += `&customfield_13205=`;
    bodyReq += `&duedate=${get_str_date(issue.due_date, "DD/MMM/YY")}`;
    bodyReq += `&dnd-dropzone=`;
    bodyReq += `&customfield_10000=`;
    bodyReq += `&customfield_11403=`;
    bodyReq += `&customfield_11406=`;
    bodyReq += `&issuelinks=issuelinks`;
    bodyReq += `&issuelinks-linktype=blocks`;
    bodyReq += `&customfield_12901=`;
    bodyReq += `&security=11100`;
    bodyReq += `&customfield_10301=${nullToDefault(defect_type_id, "-1")}`;
    bodyReq += `&customfield_10300=${nullToDefault(cause_category_id, "-1")}`;
    bodyReq += `&customfield_18403=-1`;
    bodyReq += `&customfield_10202=`;
    bodyReq += `&customfield_10200=`;
    bodyReq += `&customfield_10201=`;
    bodyReq += `&comment=`;
    bodyReq += `&commentLevel=`;

    return fetch(`${configs.common.jira_base_url}/secure/QuickEditIssue.jspa?issueId=${issueId}&decorator=none`, {
        "headers": {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        "body": bodyReq,
        "method": "POST",
    });
}

/* Start import issue */ init();