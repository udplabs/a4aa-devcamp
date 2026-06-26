# Module 00: Prerequisites

## Sign in to your Auth0 account

As part of the provisioning process for your Auth0 tenant, an Auth0 admin was created that corresponds to the email address you used to sign in to this very platform (https://labs.demo.okta.com).

> [!IMPORTANT]
> Your Auth0 tenant will be available for *thirty (30) days* for exploration and development.

To activate your tenant, follow these instructions:

1. From the Launch Pad on the right of the screen, click on **Accept Invitation**.
2. Follow the instructions to accept the invitation.
3. Upon successful acceptance of the invitation, you will land in your newly created Auth0 tenant.

> [!NOTE]
> Your Auth0 tenant is created for you when you launch the lab, and your management credentials are available in the Launch Pad. You will provision the Nexus resources (backend API, MCP resource server, agent client, CRM OAuth2 connection, and where available, FGA store and CIBA client) with one click directly from the app in the next section. Three capabilities (**OBO token exchange**, **Token Vault on the CRM connection**, and **CIBA**) require a one-time toggle in the Auth0 Dashboard. Each module guides you to the exact setting when you need it.

## Navigating your Lab Guide

Before we get started, here is some information about the Labs.Demo.Okta platform you are using today.

### dev{camp} Outline

On the left of the screen, you will find an outline of today's lab which also serves as your navigation control panel. This dev{camp} Agentic AI workshop consists of **seven (7)** <mark>**modules**</mark> (00 through 06), where the final module is a closing end-to-end run. Each module contains <mark>**tasks**</mark> with <mark>**steps**</mark>. You can collapse the outline at any time by clicking on the arrow icon.

At the bottom of each section, there's a handy control to navigate forwards and backwards between sections. You can also simply click on different sections (and subsections) to navigate freely.

### Launch Pad

On the right of the screen, you will find an easy way to launch your lab resources. Each resource has its own launch button along with the tenant names and credentials (where applicable).

### Dynamic Lab Guide Variables

In addition to the ability to copy credentials from the Launch Pad, we've also produced this lab guide using *dynamic variables*. Some variables (*not all*) will display values *specific* to your lab environment. For example, your tenant domain: `{{idp.tenantDomain}}`.

> [!NOTE]
> If you see what appears as though it *should* be a dynamic variable, you'll be able to tell by the curly braces: <kbd>{{...}}</kbd>.
>
> Technology isn't perfect! Chances are something went awry and the variable did not populate.

### Just a few things...

- Throughout the lab you will see various types of alerts/panels like the following.

  They provide useful information. Take a minute to familiarize yourself with their intent so you know which ones you should *really* pay attention to. :)

  > [!NOTE]
  > Useful information that might help you.

  > [!TIP]
  > Helpful advice for doing things better or more easily.

  > [!IMPORTANT]
  > Key information you may need to know to complete the lab.

  > [!WARNING]
  > Urgent info that needs your immediate attention to avoid problems.

  > [!CAUTION]
  > Advises about risks or negative outcomes of certain actions.

<br>

**Phew!** 😮‍💨 *Now that all of that is out of the way,* <span style="font-variant: small-caps; font-weight: 700">let's set up your environment!</span>

## Your lab environment

Above, you activated your Auth0 tenant. The lab is designed to run in **GitHub Codespaces**, a cloud development environment that opens in your browser — nothing to install, everything pre-configured. It also runs locally on your own machine if you prefer (Node.js 20+ required). The steps below are the same either way.

> [!NOTE]
> **Running locally instead of Codespaces?** Clone the repository, open a terminal in the `demo-app/` directory, and follow the same steps below. All modules work locally except the live Token Vault path in Module 03 — Auth0 (a cloud service) cannot reach `localhost:3002` to perform the CRM OAuth flow, so the vault falls back to the in-memory simulation. Everything else, including login, MCP, CIBA, and FGA, works exactly as described.

#### *It is important that the requirements are met in order for your participation in the lab to be successful.*

## Prerequisites

Because the environment lives in the cloud, the list is short. You need:

- **A GitHub account**, used to launch and run the Codespace.
- **A modern web browser** (a current version of Chrome, Edge, Firefox, or Safari).
- **A stable internet connection.** If you are typically on a corporate VPN that restricts access to GitHub or Auth0, *please disable the VPN for this lab.*
- **Access to your Auth0 tenant** (activated above).
- **The Auth0 Guardian mobile app** (optional, for Module 04, CIBA only).

> [!NOTE]
> You do **not** need to install Node.js, a code editor, or any project dependencies on your own machine. The Codespace ships with all of them preconfigured. There are no laptop hardware or operating-system requirements beyond running a current browser.

## Launch your Codespace

1. From the Launch Pad in the Lab Guide, open the repository link for the lab.
2. Start a Codespace on the repository (**Code > Codespaces > Create codespace on the lab branch**).
3. Wait for the environment to finish building. When it is ready you will have a full VS Code editor and terminal in your browser, with the project already cloned and its dependencies installed.

> [!TIP]
> Prefer your own editor? You can connect the desktop VS Code app to a running Codespace, but it is not required. Everything in this lab works from the in-browser editor.

> [!TIP]
> **Already have a Codespace open?** If the lab material has been updated since you created it, pull the latest changes before starting:
> ```bash
> git pull
> cd demo-app && npm install
> ```
> Then restart the app with `npm run dev`.

## Configure and provision your environment

Once the Codespace finishes building, install dependencies and start the app in the terminal:

```bash
cd demo-app
npm install
npm run dev
```

The Codespace will open a browser preview automatically. When you open it for the first time, you will see a **setup screen**; this is expected. Follow these steps:

### Step 1: add your credentials to `.env`

The setup screen shows the three environment variables Nexus needs to connect to your Auth0 tenant. Copy each value from the **Launch Pad** on the right side of the screen.

In the Codespace terminal, create the `.env` file in the `demo-app` directory:

```bash
touch demo-app/.env
```

Then open `demo-app/.env` in the editor and paste the three values from the **Launch Pad**:

```
AUTH0_DOMAIN=<your-tenant>.auth0.com
AUTH0_MGMT_CLIENT_ID=<management-client-id>
AUTH0_MGMT_CLIENT_SECRET=<management-client-secret>
```

The app polls for these variables every few seconds. Once it detects them, the setup screen will automatically advance.

> [!TIP]
> The setup screen has a **Copy keys** button that copies the variable names to your clipboard. Open `demo-app/.env` in the Codespace editor, paste the names, and fill in the values from the Launch Pad.

### Step 2: provision Auth0 resources

After the credentials are detected, the app shows the **Provision Resources** screen. Click the **Provision Resources** button.

Nexus calls the Auth0 Management API and creates the Auth0 API registrations your app will use throughout the lab — the backend API, MCP resource server, agent client, CRM connection, and where available, FGA store and CIBA client. This takes about 10 seconds.

When provisioning completes, the server restarts automatically and the app reloads into its normal state.

> [!NOTE]
> If provisioning fails, the error message will tell you which step failed. The most common cause is incorrect management credentials. Double-check the values from the Launch Pad and try again.

### Step 3: confirm the app is running

After the reload, you should see the Nexus chat interface. You are now ready to start Module 01.

> [!NOTE]
> Your Auth0 tenant comes pre-loaded with two demo employees. You will use both throughout the lab to observe access decisions:
> - **`alice@docagent.demo`** — engineering team member with access to engineering documents
> - **`bob@docagent.demo`** — all-company viewer only, denied on engineering and confidential documents
>
> These users exist in your tenant already. Their passwords are shown in the **Demo Users** section of your Launch Pad.

## Confirm access to your Auth0 tenant

If you have not already opened your Auth0 tenant (or if you closed it), launch into it from the Launch Pad in the Lab Guide. You will be using this throughout the lab, so we advise you keep a tab open.

> [!NOTE]
>
> If there are any issues, please make sure you have accepted the invitation above first.
>
> *If any issues continue to persist with accessing the Auth0 tenant, please flag down one of the lab assistants to troubleshoot.*

## Confirm Auth0 Guardian download

> [!NOTE]
> Auth0 Guardian is needed for **Module 04 (CIBA)**, where you approve a document sharing action from your own device. Enrollment is optional; the in-memory fallback covers the full flow offline if you skip it.

Make sure to download the Auth0 Guardian app on your mobile device from the App Store (iOS) or Google Play (Android).

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed this module.*

This module was entirely focused on activating your tenant, orienting you to the lab platform, and making sure your access and environment were all properly configured.

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      activated your Auth0 tenant by accepting the invitation;
  </li>
  <li style="list-style-type:'✅ '">
      familiarized yourself with the Lab Guide outline, Launch Pad, and dynamic variables;
  </li>
  <li style="list-style-type:'✅ '">
      confirmed you have a GitHub account and a modern browser;
  </li>
  <li style="list-style-type:'✅ '">
      launched the lab's GitHub Codespace environment;
  </li>
  <li style="list-style-type:'✅ '">
      understood that Node.js, the editor, and dependencies come preprovisioned in the Codespace;
  </li>
  <li style="list-style-type:'✅ '">
      added your Auth0 management credentials to <code>.env</code> from the Launch Pad;
  </li>
  <li style="list-style-type:'✅ '">
      provisioned Auth0 resources using the in-app Provision Resources button;
  </li>
  <li style="list-style-type:'✅ '">
      confirmed the Nexus chat interface loaded after provisioning;
  </li>
  <li style="list-style-type:'✅ '">
      downloaded the Auth0 Guardian application on your mobile device (for Module 04, CIBA).
  </li>
</ul>

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
