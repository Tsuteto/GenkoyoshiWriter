import {GenkoYoshi} from "./genkoyoshi.js";

export class Settings {
    constructor($container, main) {
        this.main = main;
        /** @type {GenkoYoshi} */
        this.genko = main.genko;
        this.$container = $container;
        this.$body = $("#settings-content")

        this.$rows = this.$body.find("#rows");
        this.$cols = this.$body.find("#cols");
        this.$cellOptionToggles = this.$body.find(".cell-option-toggle");
        this.$lightColorRange = this.$body.find("#lightColor");
        this.$colorPalette = this.$body.find("#colorPalette");
        this.$wallpaper = this.$body.find("#wallpaper");
        this.$selectionStyle = {
            default: this.$body.find("#selectionStyleDefault"),
            marker: this.$body.find("#selectionStyleMarker")
        };

        this.params = {
            lightColor: 1,
            wallpaper: "cover-wood1",
            selectionStyle: GenkoYoshi.SELECTION_STYLE.default,
        };
    }

    init() {
        this.params = {
            rows: this.genko.rowSize,
            cols: this.genko.colSize,
            cellOptions: this.genko.cellOptions,
            lightColor: this.params.lightColor,
            wallpaper: this.params.wallpaper,
            selectionStyle: this.genko.selectionStyle
        };

        this.$body.find("#size-20x20").click(e => this.onSizeChanged(20, 20));
        this.$body.find("#size-20x10").click(e => this.onSizeChanged(10, 20));
        this.$body.find("#size-14x10").click(e => this.onSizeChanged(10, 14));
        this.$body.find("#size-8x7").click(e => this.onSizeChanged(7, 8));
        this.$rows.val(this.params.rows).change(this.onRowsChanged.bind(this));
        this.$cols.val(this.params.cols).change(this.onColsChanged.bind(this));

        this.$lightColorRange.val(this.params.lightColor).on("input", this.onLightColorChanged.bind(this));

        this.$cellOptionToggles.each((idx, e) => 
                $(e).prop("checked", this.genko.cellOptions[$(e).attr("id")]).click(this.onCellOptionToggled.bind(this)));

        GenkoYoshi.COLOR_PALETTE.map(color =>
            $("<button class='btn btn-outline-secondary'>")
                .append($("<div class='color-indicator'>").css("background-color", color))
                .toggleClass("active", color == this.genko.featuringColor)
                .data("color", color)
                .click(this.onColorChanged.bind(this))
        ).forEach($btn => this.$colorPalette.append($btn));

        Settings.WALLPAPER.map(group => {
            var $optgrp = $("<optgroup>", {label: group.group});
            group.list.map(wp => $("<option>").val(wp.key).text(wp.name)).forEach($opt => $optgrp.append($opt));
            return $optgrp;
        }).forEach($optgrp => this.$wallpaper.append($optgrp));
        this.$wallpaper.val(this.params.wallpaper).change(this.onWallpaperChanged.bind(this));

        this.$body.find("#font")
                .val(this.genko.featuringFont)
                .change(this.onFontChanged.bind(this));
        this.$body.find("#fontRoman")
                .val(this.genko.featuringFontRoman)
                .change(this.onFontRomanChanged.bind(this));

        this.$clearBtn = $("#clearBtn").click(this.onClearClicked.bind(this));
        
        this.main.setLightColor(this.params.lightColor);
        this.main.setWallpaper(this.params.wallpaper);

        for (let key in GenkoYoshi.SELECTION_STYLE) {
            let style = GenkoYoshi.SELECTION_STYLE[key];
            $("<button class='btn btn-outline-secondary'>")
                .append($("<div class='color-indicator'>").css("background-color", style.color))
                .toggleClass("active", style.color === this.genko.selectionStyle.color
                        && style.type === this.genko.selectionStyle.type)
                .data("style", style)
                .click(this.onSelectionStyleChanged.bind(this))
                .appendTo(this.$selectionStyle[style.type])
        }

        return this;
    }

    onSizeChanged(rows, cols) {
        this.params.rows = rows;
        this.params.cols = cols;
        this.genko.setSize(this.params.rows, this.params.cols);
        this.$rows.val(rows);
        this.$cols.val(cols);
        this.main.setPrintPageSize(rows, cols);
    }

    onRowsChanged(e) {
        let rows = $(e.target).val();
        rows = Math.min(100, Math.max(3, rows));
        $(e.target).val(rows);
        this.params.rows = rows;
        this.genko.setSize(this.params.rows, this.params.cols);
        this.main.setPrintPageSize(rows, cols);
    }
    onColsChanged(e) {
        let cols = $(e.target).val();
        cols = Math.min(100, Math.max(3, cols));
        $(e.target).val(cols);
        this.params.cols = cols;
        this.genko.setSize(this.params.rows, this.params.cols);
        this.main.setPrintPageSize(rows, cols);
    }

    onCellOptionToggled(e) {
        let checked = $(e.target).is(":checked");
        let name = $(e.target).attr("id");
        this.params.cellOptions[name] = checked;
        this.genko.setCellOption(name, checked);
    }

    onColorChanged(e) {
        let color = $(e.target).data("color");
        this.genko.setColor(color);
        this.$colorPalette.find(".btn").each((i, btn) => {
            $(btn).toggleClass("active", $(btn).data("color") == color);
        });
    }

    onFontChanged(e) {
        this.genko.setFont($(e.target).val());
    }

    onFontRomanChanged(e) {
        this.genko.setFontRoman($(e.target).val());
    }

    onWallpaperChanged(e) {
        let nextVal = $(e.target).val();
        this.main.setWallpaper(nextVal);
        this.params.wallpaper = nextVal;
    }

    onLightColorChanged(e) {
        let nextVal = $(e.target).val();
        this.main.setLightColor(nextVal);
        this.params.lightColor = nextVal;
    }

    onSelectionStyleChanged(e) {
        let style = $(e.target).data("style");
        this.genko.setSelectionStyle(style);
        $("#selectionStyle").find(".btn").each((i, btn) => {
            $(btn).toggleClass("active", $(btn).data("style") === style);
        });
    }

    onClearClicked(e) {
        if (confirm("入力内容を消去しますか？保存内容も消去されます。")) {
            this.genko.clear();
            this.genko.save();
        }
    }

    getParams() {
        return this.params;
    }

}

// For old Safari, static class fields define outside the class
Settings.WALLPAPER = [
        {group: "木目調", list: [
            {key: "cover-wood1", name: "明るい木目調"},
            {key: "cover-wood4", name: "白い木目調"},
            {key: "cover-wood6", name: "落ち着いた木目調"},
            {key: "cover-wood2", name: "濃いめの木目"},
            {key: "cover-wood5", name: "暗めの木目調"},
            {key: "pattern-wood1", name: "真っ黒な木目調"},
            {key: "cover-wood3", name: "コルクボード風"}
        ]},
        {group: "ダンボール", list: [
            {key: "cover-cardboard1", name: "ダンボール"},
            {key: "cover-cardboard2", name: "ボロの箱"}
        ]},
        {group: "無地", list: [
            {key: "solid-white", name: "白"},
            {key: "solid-lightgrey", name: "明るいグレー"},
            {key: "solid-darkgrey", name: "暗めのグレー"},
            {key: "solid-cream", name: "クリーム"}
        ]}
    ];

