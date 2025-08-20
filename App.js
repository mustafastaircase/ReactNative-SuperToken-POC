import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, Text, TextInput, Button, View, ScrollView } from "react-native";
import * as AuthSession from "expo-auth-session";
import SuperTokens from "supertokens-react-native";
import axios from "axios";
import * as WebBrowser from "expo-web-browser";
import { Buffer } from "buffer"; // required for decoding id_token
import { API_DOMAIN, GOOGLE_CLIENT_ID, WEB_LOGIN_URL } from "@env"; // using react-native-dotenv

// ====== CONFIG ======
const api = axios.create({ baseURL: API_DOMAIN, timeout: 7000 });

// Google OAuth endpoints (OIDC)
const discovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

function rand(len = 24) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function App() {
  const [email, setEmail] = useState(`user${Date.now()}@example.com`);
  const [password, setPassword] = useState("Passw0rd!");
  const [userId, setUserId] = useState(null);

  // ---- SuperTokens init + axios interceptors
  useEffect(() => {
    SuperTokens.init({ apiDomain: API_DOMAIN, apiBasePath: "/auth" });
    SuperTokens.addAxiosInterceptors(api);
  }, []);

  // ---- Expo AuthSession (PKCE) wiring
  const redirectUri = useMemo(() => {
    return AuthSession.makeRedirectUri({ useProxy: true });
  }, []);

  const [nonce] = useState(() => rand(16));
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ["profile"],
      usePKCE: true,
      extraParams: { nonce },
    },
    discovery
  );

  // --- API helpers ---
  const ping = async () => api.get("/ping");
  const signUp = async () =>
    api.post("/auth/signup", {
      formFields: [{ id: "email", value: email }, { id: "password", value: password }],
    });
  const signIn = async () =>
    api.post("/auth/signin", {
      formFields: [{ id: "email", value: email }, { id: "password", value: password }],
    });
  const hello = async () => api.get("/hello");
  const me = async () => {
    const { data } = await api.get("/me");
    setUserId(data.userId ?? null);
    return data;
  };
  const forceRefresh = async () => SuperTokens.attemptRefreshingSession();
  const revoke = async () => api.post("/revoke");
  const signOut = async () => {
    await api.post("/auth/signout");
    setUserId(null);
  };

  // --- Google PKCE login (Expo) ---
  const decodeIdTokenClaims = (jwt) => {
    try {
      const [, payload] = jwt.split(".");
      const json = JSON.parse(
        Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
      );
      return {
        iss: json.iss,
        aud: json.aud,
        sub: json.sub,
        email: json.email,
        email_verified: json.email_verified,
        iat: json.iat,
        exp: json.exp,
      };
    } catch {
      return null;
    }
  };

  const googleLoginPKCE = async () => {
    if (!request) return;
    const res = await promptAsync({ useProxy: true });
    if (res.type !== "success") return;

    const tokenResult = await AuthSession.exchangeCodeAsync(
      {
        clientId: GOOGLE_CLIENT_ID,
        code: res.params.code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier },
      },
      discovery
    );

    const { id_token } = tokenResult;
    if (!id_token) return;

    await api.post("/auth/google/mobile", { idToken: id_token, nonce });
    await me();
  };

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>SuperTokens RN (Expo) + Google PKCE</Text>

      <View style={{ gap: 8, marginVertical: 8 }}>
        <Text>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 8 }}
        />
        <Text>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 8 }}
        />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <Button title="PING" onPress={ping} />
        <Button title="SIGN UP" onPress={signUp} />
        <Button title="SIGN IN" onPress={signIn} />
        <Button title="HELLO" onPress={hello} />
        <Button title="ME" onPress={me} />
        <Button title="FORCE REFRESH" onPress={forceRefresh} />
        <Button title="REVOKE" onPress={revoke} />
        <Button title="SIGN OUT" onPress={signOut} />
      </View>

      <View style={{ marginVertical: 12 }}>
        <Button
          title="Login through Web"
          onPress={() => WebBrowser.openBrowserAsync(WEB_LOGIN_URL)}
        />
      </View>

      <View style={{ marginVertical: 12 }}>
        <Button title="Google (PKCE via Expo)" onPress={googleLoginPKCE} disabled={!request} />
      </View>

      <Text style={{ marginTop: 12, fontWeight: "600" }}>
        Session user: {userId || "— (not signed in)"}
      </Text>

      <ScrollView style={{ marginTop: 6, height: 260, borderWidth: 1, borderColor: "#ddd", padding: 8, borderRadius: 8 }}>
        <Text selectable>{userId ? `Logged in as ${userId}` : "Logs removed for production"}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
