/*global chrome*/

/**
 * author: CuongPV10
 * 2022/04/10
 */

async function import_settings(file) {
    let data = await file_to_json(file);
    if (confirm("Do you save config?")) {
        save_settings(data);
        let saved_configs = await get_settings();
        display_config(saved_configs);
    }
}

function display_config(configs) {
    if (!configs) return;

    let conmon_cfgs_str = JSON.stringify(configs.common, null, "\t");
    let bug_cfgs_str = JSON.stringify(configs.bug, null, "\t");
    let api_cfgs_str = JSON.stringify(configs.api, null, "\t");

    document.getElementById("main_setting_input").value = conmon_cfgs_str;
    document.getElementById("bug_settings_input").value = bug_cfgs_str;
    document.getElementById("api_settings_input").value = api_cfgs_str;
}

async function file_to_json(file) {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader()
        fileReader.onload = event => resolve(JSON.parse(event.target.result))
        fileReader.onerror = error => reject(error)
        fileReader.readAsText(file)
    })
}

function collect_to_save_settings() {
    let main_settings = document.getElementById("main_setting_input").value;
    let bug_settings = document.getElementById("bug_settings_input").value;
    let api_settings = document.getElementById("api_settings_input").value;

    let configs = {
        common: JSON.parse(main_settings),
        bug: JSON.parse(bug_settings),
        api: JSON.parse(api_settings)
    }

    save_settings(configs);
}

function save_settings(configs) {
    chrome.storage.local.set({ "settings": configs }, function () {
        console.log("Settings has been saved.");
        chrome.runtime.sendMessage('', {
            req: "notif",
            options: {
                title: 'Settings',
                message: 'Has been save successfully!',
                iconUrl: '/img/ex_logo.png',
                type: 'basic'
            }
        }, function (response) {
            console.log(response);
        });
    });
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

async function create_file() {
    let dataObj = await get_settings();
    let dataStr = JSON.stringify(dataObj, null, "\t");

    var file;
    var data = dataStr.split(/\r?\n/);
    var properties = { type: 'text/plain' };
    try {
        file = new File(data, "settings.json", properties);
    } catch (e) {
        file = new Blob(data, properties);
    }
    var url = URL.createObjectURL(file);
    console.log(url);
    document.getElementById('download_link').href = url;
}

document.getElementById("btn_import").addEventListener("click", function () {
    document.getElementById("import_file").click();
});

document.getElementById("btn_export").addEventListener("click", function () {
    create_file();
    document.getElementById("download_link").click();
});

document.getElementById('import_file').addEventListener('change', (event) => {
    const fileList = event.target.files;
    import_settings(fileList[0]);
    this.value = "";
});

document.addEventListener('DOMContentLoaded', async function () {
    let saved_configs = await get_settings();
    display_config(saved_configs);
});

document.getElementById("btn_save").addEventListener("click", function (event) {
    if (confirm("Do you save settings?")) {
        collect_to_save_settings();
    }
});