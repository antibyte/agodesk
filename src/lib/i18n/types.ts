import de from "./messages/de.json";

export type Messages = Record<string, string>;

export type MessageKey = keyof typeof de;
