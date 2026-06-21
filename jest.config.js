module.exports = {
    testEnvironment: "node",
    testMatch: [
        "<rootDir>/tests/unit/**/*.spec.js"
    ],
    transform: {
        "^.+\\.js$": "babel-jest"
    },
    moduleNameMapper: {
        "^@main/(.*)$": "<rootDir>/src/main/$1",
        "^@shared/(.*)$": "<rootDir>/src/shared/$1",
        "^@/(.*)$": "<rootDir>/src/renderer/$1"
    },
    modulePathIgnorePatterns: [
        "<rootDir>/dist",
        "<rootDir>/dist_electron",
        "<rootDir>/dist-electron"
    ]
};
