/**
 * author: CuongPV10
 * 2022/04/10
 */

function openCity(evt, cityName) {
    var i, x, tablinks;
    x = document.getElementsByClassName("d_settings");
    for (i = 0; i < x.length; i++) {
        x[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablink");
    for (i = 0; i < x.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" w3-red", "");
    }
    document.getElementById(cityName).style.display = "block";
    evt.currentTarget.className += " w3-red";
}

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById("main_settings").click();
});

document.getElementById("main_setting_input").addEventListener('keydown', function (e) {
    if (e.key == 'Tab') {
        e.preventDefault();
        var start = this.selectionStart;
        var end = this.selectionEnd;
        this.value = this.value.substring(0, start) +
            "\t" + this.value.substring(end);
        this.selectionStart =
            this.selectionEnd = start + 1;
    }
});

document.getElementById("main_settings").addEventListener("click", function (event) {
    openCity(event, 'd_main_settings');
});

document.getElementById("tab1_settings").addEventListener("click", function (event) {
    openCity(event, 'd_tab1_settings');
});

document.getElementById("tab2_settings").addEventListener("click", function (event) {
    openCity(event, 'd_tab2_settings');
});
