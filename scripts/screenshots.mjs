// Seeds a demo account through the web UI and captures the README screenshots into docs/screenshots.
// Run it through the `screenshots` devenv script, which starts a throwaway server and database. The
// past days of habit check-ins, completed tasks and focus sessions are made by moving the browser's
// clock, so the habits and stats screens have history.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:8090";
const OUT = process.env.OUT_DIR ?? "docs/screenshots";
const DAY = 86_400_000;
const ACCOUNT = { name: "Alex Rivera", email: "alex@example.com", password: "demo-password-123" };
const HABITS = ["Meditate", "Read 20 pages", "Drink water", "Evening walk"];
const CHORES = ["Answer emails", "Review the week", "Grocery run", "Pay invoices", "Tidy the desk"];
const PROFILE = mkdtempSync(join(tmpdir(), "atlas-screenshots-"));

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 };
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

/** A browser on the shared profile, so the session and local store carry over between layouts. */
async function open(layout, colorScheme = "light") {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: process.env.CHROMIUM,
    headless: true,
    colorScheme,
    args: ["--no-sandbox"],
    ...layout,
  });
  return { ctx, page: ctx.pages()[0] ?? (await ctx.newPage()) };
}

const pause = (page, ms = 1500) => page.waitForTimeout(ms);

async function save(page, name) {
  const { width, height } = page.viewportSize();
  await page.mouse.move(width - 1, height - 1);
  await pause(page, 600);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`saved ${name}.png`);
}

async function addTasks(page, field, titles) {
  for (const title of titles) {
    await field().click();
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
    await pause(page, 500);
  }
  await page.keyboard.press("Escape");
}

async function signUp(page) {
  await page.goto(BASE);
  await page.getByText("Need an account? Sign up").click();
  await page.getByLabel("Name").fill(ACCOUNT.name);
  await page.getByLabel("Email").fill(ACCOUNT.email);
  await page.getByLabel("Password", { exact: true }).fill(ACCOUNT.password);
  await page.getByText("Create account").click();
  await page.getByText("Skip setup").click({ timeout: 60_000 });
  await pause(page);
}

/** Projects, sections and tasks, typed through quick add so its date and priority parsing does the work. */
async function seedProjects(page) {
  await page.goto(`${BASE}/projects`);
  for (const name of ["Website relaunch", "Home", "Reading list"]) {
    await page.getByPlaceholder("New project").click();
    await page.keyboard.type(name);
    await page.keyboard.press("Enter");
    await pause(page, 600);
  }
  await page.keyboard.press("Escape");
  const urls = {};
  for (const name of ["Website relaunch", "Home", "Reading list"]) {
    await page.getByLabel(name, { exact: true }).first().click();
    await pause(page, 1200);
    urls[name] = page.url();
  }

  await page.goto(urls["Website relaunch"]);
  await page.getByPlaceholder("Add section").waitFor();
  for (const section of ["Design", "Build", "Launch"]) {
    await page.getByPlaceholder("Add section").click();
    await page.keyboard.type(section);
    await page.keyboard.press("Enter");
    await pause(page, 600);
  }
  await page.keyboard.press("Escape");
  const inSection = (s) => () => page.getByLabel(`Add task to ${s}`);
  await addTasks(page, inSection("Design"), [
    "Finalize the color palette today 8pm p2",
    "Hero illustration in 3 days",
    "Review mobile mockups with the team tomorrow 2pm p1",
  ]);
  await addTasks(page, inSection("Build"), [
    "Set up the staging server today 9pm p1",
    "Migrate blog posts tomorrow",
    "Accessibility audit every friday",
    "Image CDN and caching in 4 days p3",
  ]);
  await addTasks(page, inSection("Launch"), [
    "Write the announcement post in 6 days",
    "Schedule the newsletter in 7 days p2",
    "Update social profiles",
  ]);

  const anyTask = () => page.getByPlaceholder(/Add a task/).first();
  await page.goto(urls["Home"]);
  await addTasks(page, anyTask, [
    "Pay the electricity bill today p1",
    "Water the plants every 3 days",
    "Book a dentist appointment tomorrow 9am",
    "Fix the leaking tap in 2 days p3",
  ]);
  await page.goto(urls["Reading list"]);
  await addTasks(page, anyTask, [
    "The Pragmatic Programmer",
    "Designing Data-Intensive Applications p2",
    "A Philosophy of Software Design",
  ]);
  return urls;
}

/** Notes, subtasks, labels and a comment on the task the detail screenshots show. */
async function seedTaskDetail(page, projectUrl) {
  await page.goto(projectUrl);
  await page.getByText("Review mobile mockups with the team").click();
  await page
    .getByPlaceholder("Add notes...")
    .fill(
      "Walk through the new onboarding and checkout flows. Collect feedback in the design doc before Friday.",
    );
  for (const title of ["Onboarding screens", "Checkout flow", "Dark mode variants"]) {
    await page.getByPlaceholder(/Add a subtask/).click();
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
    await pause(page, 600);
  }
  await page.keyboard.press("Escape");
  for (const label of ["design", "mobile"]) {
    await page.getByPlaceholder("Add or create a label...").click();
    await page.keyboard.type(label);
    await page.keyboard.press("Enter");
    await pause(page, 600);
  }
  await page.getByPlaceholder("Write a comment…").click();
  await page.keyboard.type("Mockups are in the shared folder, v3 has the new checkout.");
  await page.keyboard.press("Enter");
  await pause(page);
}

/** Three weeks of habit check-ins, completed chores and focus sessions, one browser day at a time. */
async function seedHistory(page) {
  const morning = new Date();
  morning.setHours(9, 0, 0, 0);
  const at = (daysAgo) => new Date(morning.getTime() - daysAgo * DAY + (daysAgo % 3) * 3_600_000);
  await page.clock.install({ time: at(20) });

  await page.goto(`${BASE}/habits`);
  for (const name of HABITS) {
    await page.getByText("Add habit", { exact: true }).first().click();
    await page.getByPlaceholder("e.g. Meditate").fill(name);
    await page.getByText("Add", { exact: true }).last().click();
    await pause(page, 1000);
  }

  for (let d = 19; d >= 0; d--) {
    await page.clock.setSystemTime(at(d));
    await page.goto(`${BASE}/habits`);
    await page.getByText("Add habit").first().waitFor();
    await pause(page, 1200);
    const done = [d % 6 !== 4, d % 4 !== 1 || d > 12, true, d % 2 === 0];
    for (const [i, name] of HABITS.entries()) {
      const toggle = page.getByLabel(`Mark ${name} done today`);
      if (done[i] && (await toggle.count())) {
        await toggle.first().click();
        await pause(page, 250);
      }
    }
    if (d === 0) break;

    await page.goto(`${BASE}/inbox`);
    const n = 1 + ((d * 7) % 4);
    await addTasks(
      page,
      () => page.getByPlaceholder(/Add a task/).first(),
      Array.from({ length: n }, (_, i) => CHORES[(d + i) % CHORES.length]),
    );
    for (let i = 0; i < n; i++) {
      await page.getByLabel("Complete task").first().click();
      await pause(page, 700);
    }

    if (d <= 6 && d !== 4) {
      await page.goto(`${BASE}/focus`);
      for (let i = 0; i < 1 + (d % 3); i++) {
        await page.getByText("Start focus").first().click();
        await page.clock.runFor(25 * 60_000 + 2000);
        await pause(page, 1200);
        // A finished session queues a break; skip it so the next one is a focus session again.
        await page.getByText("Skip phase").first().click();
        await pause(page, 400);
      }
    }
    await pause(page);
  }
  // Leave focus mode, or its floating bar shows on every screen.
  await page.goto(`${BASE}/focus`);
  await page.getByText("Stop focus").first().click();
  await pause(page, 3000);
}

async function captureDesktop(page, urls, prefix = "") {
  if (!prefix) {
    for (const view of ["upcoming", "calendar", "habits", "stats"]) {
      await page.goto(`${BASE}/${view}`);
      await pause(page, 2500);
      await save(page, view);
    }
    await page.goto(urls["Website relaunch"]);
    await pause(page, 2500);
    await save(page, "list");
  }
  await page.goto(urls["Website relaunch"]);
  await page.getByText("Board", { exact: true }).click();
  await pause(page, 2000);
  await save(page, `${prefix}board`);
  await page.getByText("Review mobile mockups with the team").first().click();
  await pause(page, 2000);
  await save(page, `${prefix}task-detail`);
  await page
    .getByText("List", { exact: true })
    .click()
    .catch(() => {});
}

async function capturePhone(page, views, suffix = "") {
  for (const view of views) {
    if (view === "task-detail") {
      await page.goto(`${BASE}/upcoming`);
      await page.getByText("Review mobile mockups with the team").first().click();
    } else {
      await page.goto(`${BASE}/${view}`);
    }
    await pause(page, 2500);
    await save(page, `phone-${view}${suffix}`);
  }
}

try {
  let { ctx, page } = await open(DESKTOP);
  await signUp(page);
  const urls = await seedProjects(page);
  await seedTaskDetail(page, urls["Website relaunch"]);
  await ctx.close();

  ({ ctx, page } = await open(DESKTOP));
  await seedHistory(page);
  await ctx.close();

  ({ ctx, page } = await open(DESKTOP));
  await captureDesktop(page, urls);
  await ctx.close();
  ({ ctx, page } = await open(DESKTOP, "dark"));
  await captureDesktop(page, urls, "dark-");
  await ctx.close();

  ({ ctx, page } = await open(PHONE));
  await capturePhone(page, ["today", "task-detail"]);
  await ctx.close();
  ({ ctx, page } = await open(PHONE, "dark"));
  await capturePhone(page, ["habits"], "-dark");
  await ctx.close();
} finally {
  rmSync(PROFILE, { recursive: true, force: true });
}
