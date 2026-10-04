import { Redirect } from "expo-router";

/**
 * `/signup?invite=...` is the link an admin hands out. Signed out, the auth gate shows the signup
 * form for it (reading the code from the address); once the account exists, this route has nothing
 * left to show and moves on to the app instead of a not-found page.
 */
export default function SignupRoute() {
  return <Redirect href="/" />;
}
