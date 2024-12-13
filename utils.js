function parseResult(result) {
    return Object.values(JSON.parse(JSON.stringify(result)));
}

module.exports = {
    parseResult,
};