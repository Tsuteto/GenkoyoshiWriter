import {GenkoYoshi} from "./genkoyoshi.js";
import {Settings} from "./settings.js";
import {SaveHandler} from "./savehandler.js";

class Main {
    constructor() {
        this.browser = (/(msie|trident|edge|chrome|safari|firefox|opera)/
                .exec(window.navigator.userAgent.toLowerCase()) || ["other"]).pop().replace("trident", "msie");

        this.genko = new GenkoYoshi($(".genko"), 20, 20);
//        .setText("原稿用紙をＷｅｂページに描いてみたよ。ルビ振りもサイズ変更自由で四百字詰めも可。直接入力できるようにしたいな。")
//        .setText("あ❗スーモ❗🌚ダン💥ダン💥ダン💥シャーン🎶スモ🌝スモ🌚スモ🌝スモ🌚スモ🌝スモ🌚ス〜〜〜モ⤴スモ🌚スモ🌝スモ🌚スモ🌝スモ🌚スモ🌝ス～～～モ⤵🌞")
//        .setRuby(["げん","こう","よう","し","","","","","","あいうえお"])
        this.settings = new Settings($("#controlPane"), this);
        this.saveHandler = new SaveHandler(this);

        $(window).on("unload", this.onClosing.bind(this));
        setInterval(this.onTimerSaving.bind(this), 5 * 60 * 1000);

        this.$pageCss = $("<style>").appendTo($("head"));
        this.$backdrop = null;

        // Buttons
        this.$saveBtn = $("#saveBtn").click(this.onSaveClicked.bind(this));
        this.$undoBtn = $("#undoBtn").click(this.onUndoClicked.bind(this));
        this.$redoBtn = $("#redoBtn").click(this.onRedoClicked.bind(this));
        this.$printBtn = $("#printBtn").click(this.onPrintClicked.bind(this));
        this.$fullscreenBtn = $("#fullscreenBtn").click(this.onFullscreenClicked.bind(this));

        // Export text
        this.$exportBtn = $("#export-text").click(this.onExportTextClicked.bind(this));
        this.$dialogExport = $("#dialog-export").modal({show: false});
        this.$dialogExport.find(".btn-okay").click(this.onExportTextConfirmed.bind(this));

        // Export as image
        this.$exportImageBtn = $("#export-image").click(this.onExportImageClicked.bind(this));
        this.$dialogExportImage = $("#dialog-export-image").modal({show: false});
        this.$dialogExportImage.find("#btn-export-image").click(this.onExportImageConfirmed.bind(this));
        $(".btn-image-export-mode input").change(this.updateExportImageMode.bind(this));

        // Twitter share button
        $("#share-twitter").click(this.onShareTwitterClicked.bind(this));

        // Define drawer action
        this.$drawers = $(".drawer");
        this.$drawers.each((idx, drawer) => {
            $(drawer).find(".drawer-accordion-box").hide();
            $(drawer).find(".drawer-header").click(e => this.onDrawerClicked(e, $(drawer)));
        });

        $(document).on('click touchend', e => {
            if (!$(e.target).closest(".drawer").length) {
                this.$drawers.find(".drawer-accordion-box").hide(200);
                this.$drawers.removeClass("active");
            }
        });
    }

    setup() {
        this.startProcessing("backdrop-opening")
                .then(() => this.saveHandler.load())
                .then(() => this.genko.init())
                .then(() => {
                    this.settings.init();
                    this.setPrintPageSize(this.genko.rowSize, this.genko.colSize);
                    $('[data-toggle="tooltip"]').tooltip();
                })
                .then(this.endProcessing.bind(this));
    }

    onDrawerClicked(e, $drawer) {
        var $accordion = $drawer.find(".drawer-accordion-box");
        var toggle = !$drawer.hasClass("active");

        this.$drawers.find(".drawer-accordion-box").hide(200);
        this.$drawers.removeClass("active");

        if (toggle) {
            $accordion.show(200);
        } else {
            $accordion.hide(200);
        }
        $drawer.toggleClass("active", toggle);
    }

    onUndoClicked() {
        this.genko.undo();
    }

    onRedoClicked() {
        this.genko.redo();
    }

    setPrintPageSize(rows, cols) {
        if (rows == 20 && cols == 20) {
            // 400字詰
            this.$pageCss.html("@page {size: A4 landscape; margin: 12mm 10mm 5mm 10mm;}")
        } else if (rows == 10 && cols == 20) {
            // 200字詰
            this.$pageCss.html("@page {size: A5 portrait; margin: 15mm 10mm 15mm 10mm;}")
        } else {
            this.$pageCss.html("");
        }
    }

    onSaveClicked() {
        this.saveHandler.save();
    }

    onFullscreenClicked() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    onPrintClicked() {
        window.print();
    }

    onExportTextClicked(e) {
        this.$dialogExport.modal("show");
    }

    onExportTextConfirmed(e) {
        var text = this.genko.getText();
        var link = document.createElement("a");
        var url = URL.createObjectURL(new Blob([text], {type: "text/plain"}));
        link.href = url;
        link.download = this.$dialogExport.find("#export-filename").val();
        //link.dataset.downloadurl = ["text/plain", link.download, link.href].join(":");
        link.click();
        this.$dialogExport.modal("hide");
    }

    onExportImageClicked(e) {
        this.$dialogExportImage.modal("show");
        this.updateExportImageMode();
    }
    
    onExportImageConfirmed(e) {
        const $pages = this.getPages();
        const isSinglePage = $pages.length == 1;
        const isAllInOne = $("#imageExportAllInOne").is(":checked") || isSinglePage;
        const funcExportAsImage = isAllInOne ? this.exportAsImage : this.exportAsImageEachPage;

        this.$dialogExportImage.modal("hide");
        this.startProcessing("backdrop-export-image")
            .then(funcExportAsImage.bind(this))
            .then(this.endProcessing.bind(this));
    }

    updateExportImageMode() {
        const $pages = this.getPages();
        const isSinglePage = $pages.length == 1;
        const isAllInOne = $("#imageExportAllInOne").is(":checked");
        let postfix;

        $(".btn-image-export-mode")
            .toggleClass("disabled", isSinglePage)
            .toggleClass("btn-outline-primary", !isSinglePage)
            .toggleClass("btn-outline-secondary", isSinglePage)
            .attr("inert", isSinglePage ? "inert" : null);

        if (isAllInOne || isSinglePage) {
            postfix = ".png";
            $("#imageFilePagingDesc").hide();
        } else {
            postfix = "-<i>ページ数</i>.png";
            $("#imageFilePagingDesc").show();
        }
        $("#image-filename-postfix").html(postfix);
    }

    exportAsImage() {
        return new Promise((resolve, reject) => {
            $(document).scrollTop(0);
            $("body").css({"padding": "0"});
            $(".genko").css({"padding": "5mm", "margin": "0", "justify-content": "left", "width": "min-content"});
            $(".genko-body").css({"margin": "0"});
            $(".genko-paper").css({"margin": "5mm"});
            $(".genko-paper.blank").hide();
            html2canvas(document.querySelector(".genko"), {
                foreignObjectRendering: this.browser != "safari",
                //useCORS: true,
                //allowTaint: true,
                windowWidth: $(".genko").width(),
                ignoreElements: elem => $(elem).is(".genko-ime, .genko-caret"),
                onclone: (doc) => {
                    $(doc).find(".genko-paper").css({"box-shadow": "none"}).removeClass("newline-visible");
                    $(doc).find(".char-body:has(.fw-space)").html("<div/>");
                    $(doc).find(".char-body:has(.newline), .char-body:has(.hw-space.single)").html("<div/>");
                    $(doc).find(".newline-after").each((idx, e) => {
                        $(e).text($(e).text());
                    });
                    $(doc).find(".hw-space.after").each((idx, e) => {
                        $(e).text($(e).text() + "\xa0");
                    })
                    $(doc).find(".hw-space.before").each((idx, e) => {
                        $(e).text("\xa0" + $(e).text());
                    })
                }
            }).then(canvas => {
                // $("body").append(canvas); // Output image on screen for debugging
                $("body").css({"padding": ""});
                $(".genko").css({"padding": "", "margin": "", "justify-content": "", "width": ""});
                $(".genko-body").css({"margin": ""});
                $(".genko-paper").css({"margin": ""});
                $(".genko-paper.blank").show();
                var link = document.createElement("a");
                var url = canvas.toDataURL();
                var filename = $("#export-image-filename").val() + ".png"
                link.href = url;
                link.download = filename;
                link.click();
                $(() => resolve())
            });
        });
    }

    async exportAsImageEachPage() {
        let $pages = this.getPages();
        $(document).scrollTop(0);
        $("body").css({"padding": "0"});
        $(".genko").css({"padding": "5mm", "margin": "0", "justify-content": "left", "width": "min-content"});
        $(".genko-body").css({"margin": "0"});
        $(".genko-paper").css({"margin": "5mm"});
        $(".genko-paper.blank").hide();
        try {
            for (const [idx, page] of $pages.toArray().entries()) {
                $pages.hide();
                $(page).show();
                const canvas = await html2canvas(document.querySelector(".genko"), {
                    foreignObjectRendering: this.browser != "safari",
                    onclone: (doc) => {
                        $(doc).find(".genko-paper").css({"box-shadow": "none"}).removeClass("newline-visible");
                        $(doc).find(".char-body:has(.fw-space)").html("<div/>");
                        $(doc).find(".char-body:has(.newline), .char-body:has(.hw-space.single)").html("<div/>");
                        $(doc).find(".newline-after").each((idx, e) => {
                            $(e).text($(e).text());
                        });
                        $(doc).find(".hw-space.after").each((idx, e) => {
                            $(e).text($(e).text() + "\xa0");
                        })
                        $(doc).find(".hw-space.before").each((idx, e) => {
                            $(e).text("\xa0" + $(e).text());
                        })
                    }
                });
                var link = document.createElement("a");
                var url = canvas.toDataURL();
                var filename = $("#export-image-filename").val() + `-${(idx + 1).toString().padStart(2, "0")}.png`
                link.href = url;
                link.download = filename;
                link.click();
            }
        } finally {
            $pages.show();
            $("body").css({"padding": ""});
            $(".genko").css({"padding": "", "margin": "", "justify-content": "", "width": ""});
            $(".genko-body").css({"margin": ""});
            $(".genko-paper").css({"margin": ""});
            $(".genko-paper.blank").show();
        }
    }

    onShareTwitterClicked(e) {
    }

    setWallpaper(key) {
        $("body").removeClass().addClass("skin-" + key);
    }

    setLightColor(val) {
        var ratio = Math.cos(val * Math.PI / 2 + Math.PI) + 1;
        $(".bg-lighting").css("background-color", `rgb(255, ${184 + 71 * ratio}, ${126 + 129 * ratio})`);
    }

    startProcessing(backdropClass) {
        return new Promise((resolve, reject) => {
            this.$backdrop = $(`<div id='processingBackdrop' class='modal-backdrop show ${backdropClass}'>`)
                    .appendTo(document.body);
            $(() => resolve());
        });
    }

    endProcessing() {
        setTimeout(() => {
            this.$backdrop.fadeOut(500, function() {this.remove();});
            this.$backdrop = null;
        });
    }

    onTimerSaving() {
        this.saveHandler.save();
    }

    onClosing() {
        this.saveHandler.save();
    }

    getPages() {
        return $(".genko-paper:not(.blank)");
    }
}

$(() => new Main().setup());
