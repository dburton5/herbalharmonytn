---
# HOW DON PUBLISHES AN APPROVED POST
# Submissions arrive in Netlify Forms (form name: write-for-herbal-harmony).
# They are not public, and nothing is published automatically.
#
# 1. Read the entry in Netlify → Forms. Download the headshot and document if attached.
# 2. Copy this file to blog/posts/YYYY-MM-DD-short-title.md
#    Example: blog/posts/2026-11-12-chamomile-evening-cup.md
# 3. Replace every CHANGE-ME. Keep voice: community and category: Community Voices
#    so the byline shows their name, photo, and Memphis neighborhood.
# 4. Put the headshot in images/uploads/ and set authorPhoto. Leave authorPhoto
#    blank if they didn't send one.
# 5. Replace the sample paragraphs with their article. Edit for clarity, length,
#    and safety. Remove diagnose / treat / cure / prevent claims.
# 6. Delete the draft line (or set draft: false) when it is ready.
#    While draft is true, the build skips the file.
# 7. Commit the file, or create the same fields in /admin → Blog Posts.
#    Netlify rebuilds and the story appears under Community Voices.
#
draft: true
voice: community
title: "CHANGE-ME: A short, specific title"
date: 2026-11-12T09:00:00.000-06:00
category: Community Voices
tags: CHANGE-ME, Memphis
description: "CHANGE-ME. One or two sentences for the card and the top of the article. No disease claims."
thumbnail: /images/uploads/CHANGE-ME.jpg
thumbnailAlt: "CHANGE-ME. Describe the photo for someone who cannot see it."
author: "CHANGE-ME Full Name"
authorRole: Community contributor
authorNeighborhood: "CHANGE-ME"
authorPhoto: /images/uploads/CHANGE-ME-headshot.jpg
authorBio: "CHANGE-ME. One or two sentences about the writer."
reviewer: Dondre Burton
reviewerRole: "Founder, Herbal Harmony TN. Edited before publishing. Not a clinical review."
takeaways:
  - "CHANGE-ME. One plain-language point a reader can remember."
  - "CHANGE-ME. A second point, still educational, not a treatment claim."
  - "CHANGE-ME. A third point, including who should be careful if that applies."
sources:
  - title: "CHANGE-ME. A study, book, or the tradition this draws on."
    url: ""
---

First paragraph in the writer's voice. Say who they are in Memphis and why this plant, recipe, or ritual matters to them.

## A useful subheading

Body of the section. Keep claims educational. "People in my family have brewed this for cold evenings" is fine. "This cures a cold" is not.

## Another subheading

Add as many sections as the piece needs. Three or more headings and the page builds an "In this article" list on its own.
