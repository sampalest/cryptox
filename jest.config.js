module.exports = {
    testEnvironment: "node",
    testMatch: [
        "<rootDir>/tests/unit/**/*.spec.js"
    ],
    transform: {
        "^.+\\.js$": "babel-jest"
    },
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1"
    },
    modulePathIgnorePatterns: [
        "<rootDir>/dist",
        "<rootDir>/dist_electron",
        "<rootDir>/dist-electron"
    ]
};
