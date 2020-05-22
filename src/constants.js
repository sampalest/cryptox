const { app } = require("electron").remote;

// Temporal
const TMP = `${app.getPath("temp")}cryptox`;

// Extension
const POINT_EXT = ".ctx";
const EXT =  "ctx";

// Exceptions
const PASSWORD_ERROR = "password_error";

export default {
    EXT: EXT,
    POINT_EXT: POINT_EXT,
    PASSWORD_ERROR: PASSWORD_ERROR,
    TMP: TMP
};
