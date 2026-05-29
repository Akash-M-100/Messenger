import http from "http";
// Test data
const testMessage = {
    channel: "EMAIL",
    toAddress: "test@example.com",
    subject: "Test Message",
    body: "This is a test message",
    fromAddress: "sender@example.com",
};
async function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "localhost",
            port: 3000,
            path,
            method,
            headers: {
                "Content-Type": "application/json",
                "x-api-key": "test-api-key-123", // Replace with real key if needed
                "idempotency-key": `test-${Date.now()}`,
            },
        };
        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: parsed,
                    });
                }
                catch {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: data,
                    });
                }
            });
        });
        req.on("error", reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}
async function runTests() {
    console.log("\n=== API Gateway Test Suite ===\n");
    // Test 1: Health check
    console.log("📋 Test 1: Health Check");
    try {
        const healthRes = await makeRequest("GET", "/health");
        console.log(`Status: ${healthRes.status}`);
        console.log("Response:", JSON.stringify(healthRes.body, null, 2));
    }
    catch (error) {
        console.error("❌ Error:", error.message);
    }
    console.log("\n---\n");
    // Test 2: Create message
    console.log("📨 Test 2: Create Message");
    try {
        const createRes = await makeRequest("POST", "/messages", testMessage);
        console.log(`Status: ${createRes.status}`);
        console.log("Response:", JSON.stringify(createRes.body, null, 2));
    }
    catch (error) {
        console.error("❌ Error:", error.message);
    }
}
// Run tests
runTests().catch(console.error);
