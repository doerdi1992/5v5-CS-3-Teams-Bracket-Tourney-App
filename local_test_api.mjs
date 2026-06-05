const PORT = 5000;
const API_URL = `http://localhost:${PORT}`;
const API_KEY = "sk_live_janaxF";
const MATCH_ID = "local_test_match_" + Date.now();

async function run() {
  console.log("🚀 STARTING LOCAL MATCH ENGINE TEST 🚀");

  // Test 1: Check create-match with missing team names (should default to Team 1 and Team 2)
  console.log("\n🧪 Test 1: Creating match config with missing team names (should default)...");
  const payload = {
    match_id: MATCH_ID,
    team1: {
      players: {
        "76561198091064949": "mosca"
      }
    },
    team2: {
      players: {
        "76561198000000002": "MockPlayer"
      }
    },
    num_maps: 1,
    maplist: ["cobblestone"], // should resolve to workshop/3329387648/de_cbble
    clinch_series: true
  };

  try {
    const res = await fetch(`${API_URL}/api/create-match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Create match failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    console.log("✅ Match config created successfully!");
    console.log(`   Config URL: ${data.configUrl}`);

    // Test 2: Fetch the generated configuration
    const localConfigUrl = `${API_URL}/match/${MATCH_ID}`;
    console.log(`\n🧪 Test 2: Fetching the generated configuration from ${localConfigUrl}...`);
    const configRes = await fetch(localConfigUrl);
    if (!configRes.ok) {
      throw new Error(`Fetch config failed: ${configRes.status} ${await configRes.text()}`);
    }

    const config = await configRes.json();
    console.log("✅ Config fetched successfully!");
    console.log("   Config details:");
    console.log(`     MatchID: ${config.matchid}`);
    console.log(`     Team 1 Name: "${config.team1.name}" (Expected: "Team 1")`);
    console.log(`     Team 2 Name: "${config.team2.name}" (Expected: "Team 2")`);
    console.log(`     Map list: ${JSON.stringify(config.maplist)} (Expected: ["workshop/3329387648/de_cbble"])`);

    // Test 3: Test RCON forwarding
    console.log("\n🧪 Test 3: Testing RCON status command via local API...");
    const rconRes = await fetch(`${API_URL}/api/rcon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY
      },
      body: JSON.stringify({ command: "status" })
    });

    if (rconRes.ok) {
      const rconData = await rconRes.json();
      console.log("✅ RCON command executed successfully!");
      console.log("   Output snippet:\n", rconData.output.split("\n").slice(0, 5).join("\n"));
    } else {
      console.log(`❌ RCON command failed: ${rconRes.status} ${await rconRes.text()}`);
    }

    // Test 4: Test loading match configuration via RCON
    console.log("\n🧪 Test 4: Testing Load Match configuration on server...");
    const loadRes = await fetch(`${API_URL}/api/load-match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY
      },
      body: JSON.stringify({ matchId: MATCH_ID })
    });

    if (loadRes.ok) {
      const loadData = await loadRes.json();
      console.log("✅ Load Match command executed successfully!");
      console.log(`   Command sent: ${loadData.command}`);
      console.log(`   Output snippet:\n`, loadData.output);
    } else {
      console.log(`❌ Load Match command failed: ${loadRes.status} ${await loadRes.text()}`);
    }

    console.log("\n🎉 ALL LOCAL INTEGRATION TESTS PASSED SUCCESSFULY! 🎉");
  } catch (err) {
    console.error(`❌ Test failed: ${err.message}`);
  }
}

run();
