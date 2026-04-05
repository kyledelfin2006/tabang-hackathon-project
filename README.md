# Team Tabang Entry
## UPV KomsaiHack 2026 — Risk Ready

**Tabang** is a web-based mobile application designed to support communities in Aklan during flood-related emergencies. It provides a centralized platform for real-time reporting, assistance coordination, and evaluation of emergency hotlines.

---

## Overview
Flood emergencies create communication gaps between residents and responders, leading to delayed assistance, poor coordination, and unreliable hotline response.

Tabang enables:
* **Real-time** flood reporting and help requests.
* **Centralized visibility** of nearby incidents.
* **A responder dashboard** for coordinated action.
* **Public evaluation** of hotline effectiveness to improve reliability and trust.

The system is community-focused and built specifically for Aklan-based emergency use cases.

---

## Project Scope

#### **MVP Scope (Implemented Features)**
* **Flood reporting:** (Location + optional image)
* **Help request system:** Direct requests for assistance.
* **Community feed:** A live stream of reports and requests.
* **Responder dashboard:** For incident monitoring.
* **Hotline directory:** Includes a rating and feedback system.
---

## Tech Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Firebase, Cloudinary
- Authentication: Firebase built in Authentication system
- Database: Firestore

---

## Core Features

#### **User Features**
* Submit flood reports in real time.
* Request emergency assistance.
* View nearby incidents via community feed.
* Access verified emergency hotlines.
* Rate and review hotline effectiveness.

#### **Responder Features**
* Monitor flood reports across Aklan.
* View and manage incoming help requests.
* Track community activity in real time.
* Analyze hotline feedback trends.

---

 ## System Flow Diagram

<p align="center">
  <img src="https://res.cloudinary.com/dz9edwf4q/image/upload/v1775397018/SystemFlowChart_qwdlmh.png" width="600">
</p>

---

 ## Success Criteria
* **Report submission time:** < 30 seconds.
* **Responder acknowledgment:** Within 2 minutes.
* **Accountability:** Improved hotline reliability through user ratings.

---

 ## System Roles

| Role | Capabilities |
| :--- | :--- |
| **Resident** | Report floods, request help, view incidents, rate hotlines. |
| **Responder** | Monitor reports, manage requests, review feedback. |
| **Firebase Admin** | Backend configuration and database management. |

> **Note:** Admin access is restricted to developers only.

---

 ## Technology Stack
* **Frontend:** HTML, CSS, JavaScript
* **Backend:** Firebase
* **Authentication:** Role-based (simulated for demo)
* **Database:** Firestore / Realtime Database

## **Design Considerations**
* Firestore structured for real-time updates (live feeds).
* Data organized by location for efficient filtering.
* Role-based UI rendering for residents and responders.

---

## Demo Access
**Test Accounts:**
* `skyline.pixel28@gmail.com`
* `nova.spark451@gmail.com`
* `midnight.echo77@gmail.com`
* `cloudyorbit19@gmail.com`
* `frostbyte.wave63@gmail.com`

## **How to Use**
**For Residents:**
1.  Log in using a demo account.
2.  Submit reports via **Report Flood**.
3.  Request help when needed.
4.  View nearby incidents.
5.  Access and evaluate emergency hotlines.

**For Responders:**
1.  Log in with a responder account.
2.  Open the **Dashboard**.
3.  Monitor reports and requests.
4.  Review hotline feedback.

---

## Project Vision
*Tabang demonstrates how localized, community-driven reporting systems can reduce response delays and improve coordination during flood emergencies in Aklan.*

---

 ## Team Members
* **Aldrin Kyle Delfin** — Team Lead, QA
* **JM Suante** — Frontend (UI/UX)
* **Rod Micheal Contado** — Frontend (UI/UX)
* **Lenard Olajay** — Backend, QA
* **Denniz Gabriel Dela Cruz** — Firebase Admin

## AI Disclosure 
This project utilized AI tools such as ChatGPT, Claude Code, and Deepseek to assist in various stages of development, including code generation, debugging, concept exploration, and improving written content for clarity and professionalism.

AI-generated outputs were used as initial references or starting points only. All code, features, and written materials were reviewed, modified, and finalized by the team to ensure correctness, relevance, and alignment with the project’s goals on disaster readiness.

Team Responsibilities
The team remained responsible for the core integrity of the project, specifically:

Designing the system architecture and feature flow.

Implementing and integrating core functionalities.

Testing, debugging, and refining outputs.

Editing and finalizing all project documentation and user-facing text.
