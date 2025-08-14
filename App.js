import React, { useEffect, useState } from "react";
import { SafeAreaView, Text, TextInput, Button, Platform, View, ScrollView } from "react-native";
import SuperTokens from "supertokens-react-native";
import axios from "axios";

const HOST = Platform.OS === "android" ? "https://fdcb1b0051b2.ngrok-free.app" : "localhost";
const API_DOMAIN = `https://fdcb1b0051b2.ngrok-free.app`;

const api = axios.create({ baseURL: API_DOMAIN, timeout: 7000 });

export default function App() {
  const [email, setEmail] = useState(`user${Date.now()}@example.com`);
  const [password, setPassword] = useState("Passw0rd!");
  const [logs, setLogs] = useState("");
  const [userId, setUserId] = useState(null);

  const log = (line) => setLogs((p) => p + line + "\n");
  const pretty = (obj) => JSON.stringify(obj, null, 2);

  useEffect(() => {
    SuperTokens.init({ apiDomain: API_DOMAIN, apiBasePath: "/auth" });
    SuperTokens.addAxiosInterceptors(api); // attaches ST interceptors
    log(`Initialized SuperTokens → ${API_DOMAIN}`);

    // optional: request/response taps for visibility
    api.interceptors.request.use((cfg) => { log(`REQ → ${cfg.method?.toUpperCase()} ${cfg.baseURL}${cfg.url}`); return cfg; });
    api.interceptors.response.use(
      (res) => { log(`RES ← ${res.status} ${res.config.url}`); return res; },
      (err) => { if (err.response) log(`ERR ← ${err.response.status} ${err.config?.url}`); else log(`ERR ← ${err.message}`); return Promise.reject(err); }
    );
  }, []);

  // --- helpers ---
  const showToken = async (label = "TOKEN") => {
    try {
      const { data } = await api.get("/token");
      const { payload } = data;
      log(`${label} → iat=${payload.iat}, exp=${payload.exp}`);
      return data;
    } catch (e) {
      log(`${label} error → ${fmtErr(e)}`);
      return null;
    }
  };

  // --- flows / buttons ---
  const ping = async () => {
    try { const { data } = await api.get("/ping"); log(`PING → ${pretty(data)}`); }
    catch (e) { log(`PING error → ${fmtErr(e)}`); }
  };

  const signUp = async () => {
    try {
      const { data } = await api.post("/auth/signup", {
        formFields: [
          { id: "email", value: email },
          { id: "password", value: password },
        ],
      });
      log(`SIGNUP → ${data.status}`);
    } catch (e) { log(`SIGNUP error → ${fmtErr(e)}`); }
  };

  const signIn = async () => {
    try {
      const { data } = await api.post("/auth/signin", {
        formFields: [
          { id: "email", value: email },
          { id: "password", value: password },
        ],
      });
      log(`SIGNIN → ${data.status}`);
    } catch (e) { log(`SIGNIN error → ${fmtErr(e)}`); }
  };

  const hello = async () => {
    try {
      const { data } = await api.get("/hello");
      log(`HELLO → ${pretty(data)}`);
    } catch (e) { log(`HELLO error → ${fmtErr(e)}`); }
  };

  const me = async () => {
    try {
      const { data } = await api.get("/me");
      setUserId(data.userId ?? null);
      log(`ME → ${pretty(data)}`);
    } catch (e) { setUserId(null); log(`ME error → ${fmtErr(e)}`); }
  };

  const forceRefresh = async () => {
    try {
      log("FORCE REFRESH → attemptRefreshingSession()");
      const hadSession = await SuperTokens.attemptRefreshingSession();
      log(`FORCE REFRESH result → ${hadSession ? "refreshed ✅" : "no session"}`);
    } catch (e) {
      log(`FORCE REFRESH error → ${String(e)}`);
    }
  };

  const revoke = async () => {
    try { const { data } = await api.post("/revoke"); log(`REVOKE (server) → ${pretty(data)}`); }
    catch (e) { log(`REVOKE error → ${fmtErr(e)}`); }
  };

  const signOut = async () => {
    try { await api.post("/auth/signout"); setUserId(null); log("SIGNOUT → OK"); }
    catch (e) { log(`SIGNOUT error → ${fmtErr(e)}`); }
  };

  const runPOC = async () => {
    setLogs(""); log("POC ▶ start");
    await ping();
    await signUp();
    await signIn();
    await me();
    const t1 = await showToken("TOKEN (before refresh)");
    await forceRefresh();                   // ← this triggers refresh token flow
    const t2 = await showToken("TOKEN (after refresh)");
    await hello();
    await revoke();                         // server revokes session
    await hello();                          // should now 401 → interceptor will try refresh, then fail
    await me();                             // should error (no session)
    log("POC ■ complete");
    if (t1 && t2) {
      log(`DIFF: iat changed? ${t1.payload.iat !== t2.payload.iat}, exp changed? ${t1.payload.exp !== t2.payload.exp}`);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>SuperTokens RN POC (rotate & logs)</Text>

      <View style={{ gap: 8, marginVertical: 8 }}>
        <Text>Email</Text>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
          style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 8 }} />
        <Text>Password</Text>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry
          style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 8 }} />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <Button title="PING" onPress={ping} />
        <Button title="SIGN UP" onPress={signUp} />
        <Button title="SIGN IN" onPress={signIn} />
        <Button title="HELLO" onPress={hello} />
        <Button title="ME" onPress={me} />
        <Button title="SHOW TOKEN" onPress={() => showToken("TOKEN")} />
        <Button title="FORCE REFRESH" onPress={forceRefresh} />
        <Button title="REVOKE (server)" onPress={revoke} />
        <Button title="SIGN OUT" onPress={signOut} />
      </View>

      <Button title="▶ Run POC (end‑to‑end)" onPress={runPOC} />

      <Text style={{ marginTop: 12, fontWeight: "600" }}>
        Session user: {userId || "— (not signed in)"}
      </Text>
      <ScrollView style={{ marginTop: 6, height: 260, borderWidth: 1, borderColor: "#ddd", padding: 8, borderRadius: 8 }}>
        <Text selectable>{logs}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function fmtErr(e) {
  if (e?.response) {
    const body = typeof e.response.data === "string" ? e.response.data : JSON.stringify(e.response.data);
    return `${e.response.status} ${body}`;
  }
  return String(e?.message || e);
}
