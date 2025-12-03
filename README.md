# 🔐 Vara Token Gate Server

This project implements a **secure token-gating backend** for applications built on the [Vara Network](https://vara.network).  
It validates users' ownership of a **fungible token (VFT)** before granting access to gated content or functionality.

---

## 🚀 Overview

The **Token Gate Server** uses cryptographic message signatures to authenticate wallet owners and validate their on-chain token balances — without requiring users to send transactions or spend gas.

It issues short-lived **JWTs** for session-based access and supports **token refresh** to extend valid sessions securely.

---

## ⚙️ Features

✅ Secure **wallet signature-based login** (no passwords)  
✅ Reads **on-chain VFT balances** via `@gear-js/api` 
✅ Issues short-lived **JWT tokens** for authenticated sessions  
✅ Supports **token refresh** to extend valid sessions without re-signing  
✅ Optional **balance revalidation** during refresh  
✅ CORS + Helmet + strict validation for production readiness  
✅ Plug-and-play with **React + Vite frontends** (via `/auth/verify` & `/entitlement`)

---

## 📦 Tech Stack

- **Node.js / Express**
- **@gear-js/api** → On-chain calls to Vara smart contracts
- **jsonwebtoken (JWT)** → Session tokens
- **helmet + cors** → Security & CORS configuration
- **zod** → Runtime schema validation
- **TypeScript**
---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Vara-Lab/token-gate-server.git
cd token-gate-server
```

### 2. Install dependencies

```bash
yarn install
```
### 3. Start the development server

```bash
yarn dev
```
The server will run on: http://localhost:3000


###  You can try the Server template on gitpod!

<p align="center">
  <a href="https://gitpod.io/#https://github.com/Vara-Lab/gasless-server-template" target="_blank">
    <img src="https://gitpod.io/button/open-in-gitpod.svg" width="240" alt="Gitpod">
  </a>
</p>


## Contributing

We welcome contributions to this project! If you'd like to contribute, please follow these guidelines:

1. **Fork the Repository**:  
   Click on the "Fork" button at the top of this repository to create your own copy.

2. **Create a Feature Branch**:  
   Create a new branch for your feature or bugfix.

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Submit a Pull Request**:  
   Once your changes are ready, submit a pull request to the `main` branch. Be sure to include a detailed description of your changes and the problem they solve.

## License

This project is licensed under the MIT License. See the LICENSE file for details.