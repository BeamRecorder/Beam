import { config } from "@vue/test-utils";
import { beforeEach } from "vitest";
import { i18n, setCurrentLocale } from "../src/i18n";

config.global.plugins = [i18n];

beforeEach(() => {
  setCurrentLocale("en");
});
