## v0.1.12

An urgent fix: opening the app at its address (and every desktop start) showed a blank page after onboarding or sign-in. Links straight to a view, such as `/today`, still worked. Your data was never affected.

### Fixes
- Declare the landing index as a drawer screen, so `/` opens your default view again
