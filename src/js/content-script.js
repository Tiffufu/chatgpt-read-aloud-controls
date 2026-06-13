// ==UserScript==
// @name        Audio Player for ChatGPT
// @namespace   Violentmonkey Scripts
// @match       https://chatgpt.com/*
// @grant       none
// @version     0.0.0.5
// @author      Ian Speckart
// @description https://github.com/ian-speckart/chatgpt-audio-player.git
// ==/UserScript==

/**
 * RUNTIMES:
 * The code in this file can run as a Chrome/Firefox extension, by installing
 * 'Audio Player for ChatGPT', or by copy/pasting this file in a script manager like
 * violentmonkey (ready to go).
 *
 * DESCRIPTION:
 * This file adds audio player controls when an audio element is being played with
 * the 'Read Aloud' feature of ChatGPT web.
 * 
 * NOTICE:
 * This extension is not affiliated with OpenAI. It was developed independently by Ian Speckart.
 * 
 * ATTRIBUTIONS:
 * See CREDITS.md
 **/

(function () {
    'use strict';

    let audio = null;
    let controlsDiv = null;
    let titleBarDiv = null;
    let contentDiv = null;
    let playPauseBtn = null;
    let backBtn = null;
    let forwardBtn = null;
    let seekBar = null;
    let seekStatusLabel = null;
    let currentTimeLabel = null;
    let timeSeparatorLabel = null;
    let durationLabel = null;
    let trackTitleLabel = null;
    let downloadBtn = null;
    let speedBtn = null;
    let speedMenu = null;
    let minimizeBtn = null;
    let monitorIntervalId = null;
    let uiSyncIntervalId = null;
    let audioTrackingInstalled = false;

    let playbackRate = Number(localStorage.getItem('ae_playbackRate') || 1);
    if (!Number.isFinite(playbackRate)) playbackRate = 1;

    let currentMimeType = 'audio/aac';
    let allChunks = [];
    let isCollapsed = false;
    let dismissedPlaybackKey = null;
    let downloadStreamId = 0;
    let trackTitleAtPlaybackStart = 'Untitled';
    let trackTitlePlaybackKey = '';
    const observedAudioElements = new Set();

    const speedOptions = [0.75, 1, 1.25, 1.5];
    const isTestMode = /(?:^|\/)test\.html(?:[?#]|$)/i.test(window.location.href);
    const nakedButtonStyle = [
        'appearance:none',
        'background:none',
        'border:none',
        'padding:0',
        'margin:0',
        'color:inherit',
        'font:inherit',
        'cursor:pointer'
    ].join(';');

    const iconButtonStyle = [
        nakedButtonStyle,
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'border-radius:999px',
        'transition:background-color 120ms ease, transform 120ms ease',
        'color:inherit',
        'box-sizing:border-box',
        'flex:0 0 auto'
    ].join(';');

    const iconMarkup = {
        collapse: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m5 15 7-7 7 7" /></svg>',
        expand: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" /></svg>',
        close: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6 6 18" /></svg>',
        backward: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m11 18-6-6 6-6v12Zm8 0-6-6 6-6v12Z" /></svg>',
        play: '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" class="size-6"><path d="M8.5 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L10.1 4.9c-.7-.4-1.6.1-1.6.9Z" /></svg>',
        pause: '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" class="size-6"><path d="M7.5 5.25c0-.69.56-1.25 1.25-1.25h1.5c.69 0 1.25.56 1.25 1.25v13.5c0 .69-.56 1.25-1.25 1.25h-1.5c-.69 0-1.25-.56-1.25-1.25V5.25Zm5 0c0-.69.56-1.25 1.25-1.25h1.5c.69 0 1.25.56 1.25 1.25v13.5c0 .69-.56 1.25-1.25 1.25h-1.5c-.69 0-1.25-.56-1.25-1.25V5.25Z" /></svg>',
        forward: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m13 6 6 6-6 6V6ZM5 6l6 6-6 6V6Z" /></svg>',
        download: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14" /></svg>'
    };

    const setButtonHoverState = (button, hoverColor = 'rgba(255,255,255,0.12)') => {
        if (!button) return;
        if (!button.dataset.idleBackground) {
            button.dataset.idleBackground = button.style.backgroundColor || 'transparent';
        }
        button.addEventListener('mouseenter', () => {
            if (button.disabled) return;
            button.style.backgroundColor = hoverColor;
            button.style.transform = 'translateY(-1px)';
        });
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = button.dataset.idleBackground || 'transparent';
            button.style.transform = 'none';
        });
    };

    const getSvgSize = (button) => {
        const buttonSize = Number(button.dataset.buttonSize || 0);
        if (buttonSize >= 40) return 22;
        if (buttonSize >= 34) return 19;
        return 18;
    };

    const setIconButton = (button, iconName, label, size = 24, hoverColor) => {
        button.type = 'button';
        button.innerHTML = iconMarkup[iconName] || '';
        button.dataset.iconName = iconName;
        button.dataset.buttonSize = String(size);
        button.setAttribute('aria-label', label);
        button.title = label;
        button.style.cssText = `${iconButtonStyle};width:${size}px;height:${size}px;`;
        const svg = button.querySelector('svg');
        if (svg) {
            const svgSize = getSvgSize(button);
            svg.style.width = `${svgSize}px`;
            svg.style.height = `${svgSize}px`;
            svg.style.display = 'block';
        }
        setButtonHoverState(button, hoverColor);
    };

    const refreshIconButton = (button, iconName, label) => {
        if (!button) return;
        const needsIconUpdate = button.dataset.iconName !== iconName;
        const needsLabelUpdate = button.getAttribute('aria-label') !== label || button.title !== label;

        if (!needsIconUpdate && !needsLabelUpdate) return;

        if (needsIconUpdate) {
            button.innerHTML = iconMarkup[iconName] || '';
            button.dataset.iconName = iconName;
            const svg = button.querySelector('svg');
            if (svg) {
                const svgSize = getSvgSize(button);
                svg.style.width = `${svgSize}px`;
                svg.style.height = `${svgSize}px`;
                svg.style.display = 'block';
            }
        }

        if (needsLabelUpdate) {
            button.setAttribute('aria-label', label);
            button.title = label;
        }
    };

    const createIconButton = (iconName, label, size = 24, hoverColor) => {
        const button = document.createElement('button');
        setIconButton(button, iconName, label, size, hoverColor);
        return button;
    };

    const formatRate = (rate) => `${String(rate).replace(/\.0$/, '')}x`;

    const formatTime = (seconds) => {
        if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const getTrackTitle = () => {
        const title = `${document.title || 'Untitled'}`.trim();
        return title || 'Untitled';
    };

    const isAudioElement = (element) => (
        typeof HTMLAudioElement !== 'undefined'
        && element instanceof HTMLAudioElement
    );

    const rememberAudioElement = (element) => {
        if (isAudioElement(element)) observedAudioElements.add(element);
        return element;
    };

    const getKnownAudioElements = () => Array.from(new Set([
        ...observedAudioElements,
        ...document.querySelectorAll('audio')
    ])).filter(isAudioElement);

    const pauseOtherAudioElements = (activeElement) => {
        getKnownAudioElements().forEach((element) => {
            if (element === activeElement || element.paused || element.ended) return;
            element.pause();
        });
    };

    const getAudioSource = (element) => {
        if (!element) return '';
        return `${element.currentSrc || element.src || ''}`;
    };

    const hasAudioSource = (element = audio) => Boolean(element && (getAudioSource(element) || element.srcObject));

    const getPlaybackKey = (element) => {
        if (!element) return '';
        const source = getAudioSource(element);
        if (source) return source;
        if (element.srcObject) return `srcObject:${element.srcObject.id || 'stream'}`;
        return '';
    };

    const getObservedAudio = () => {
        const audioElements = getKnownAudioElements();

        if (!audioElements.length) return null;

        return audioElements
            .map((element, index) => {
                let score = index;
                const source = getAudioSource(element);

                if (hasAudioSource(element)) score += 100;
                if (source && /\/backend-api\/(?:synthesize|speech\/generation)(?:[/?#]|$)/.test(source)) score += 250;
                if (element === audio) score += 20;
                if (!element.paused && !element.ended) score += 1000;
                if (Number.isFinite(element.currentTime) && element.currentTime > 0) score += 50;
                if (Number.isFinite(element.duration) && element.duration > 0) score += 25;
                if (element.readyState > 0) score += 10;
                if (element.ended) score -= 100;

                return { element, score };
            })
            .sort((a, b) => b.score - a.score)[0].element;
    };

    const hasKnownDuration = () => Boolean(audio && Number.isFinite(audio.duration) && audio.duration > 0);

    const setButtonEnabled = (button, enabled) => {
        if (!button) return;
        button.disabled = !enabled;
        button.style.opacity = enabled ? '1' : '0.45';
        button.style.cursor = enabled ? 'pointer' : 'default';
    };

    const closeSpeedMenu = () => {
        if (!speedMenu) return;
        speedMenu.style.display = 'none';
    };

    const updateTrackTitle = () => {
        if (!trackTitleLabel) return;
        const title = trackTitleAtPlaybackStart || 'Untitled';
        trackTitleLabel.textContent = title;
        trackTitleLabel.title = title;
    };

    const captureTrackTitleForPlayback = (playbackKey) => {
        trackTitleAtPlaybackStart = getTrackTitle();
        trackTitlePlaybackKey = playbackKey || '';
        updateTrackTitle();
    };

    const updateSpeedUi = () => {
        if (speedBtn) speedBtn.textContent = formatRate(playbackRate);
        if (!speedMenu) return;

        speedMenu.querySelectorAll('button[data-rate]').forEach((optionBtn) => {
            const isActive = Number(optionBtn.dataset.rate) === playbackRate;
            optionBtn.style.fontWeight = isActive ? '700' : '400';
            optionBtn.style.color = isActive ? '#fff7d6' : '#f5f3ef';
        });
    };

    const updateTimeDisplay = () => {
        const hasDuration = hasKnownDuration();

        if (currentTimeLabel) {
            currentTimeLabel.textContent = formatTime(audio ? audio.currentTime : 0);
            currentTimeLabel.style.display = hasDuration ? '' : 'none';
        }

        if (timeSeparatorLabel) {
            timeSeparatorLabel.style.display = hasDuration ? '' : 'none';
        }

        if (durationLabel) {
            durationLabel.textContent = formatTime(audio ? audio.duration : Number.NaN);
            durationLabel.style.display = hasDuration ? '' : 'none';
        }

        if (!seekBar) return;

        if (hasDuration) {
            if (seekStatusLabel) seekStatusLabel.style.display = 'none';
            seekBar.style.display = 'block';
            seekBar.disabled = false;
            seekBar.style.opacity = '1';
            seekBar.style.cursor = 'pointer';
            seekBar.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
            return;
        }

        if (seekStatusLabel) {
            seekStatusLabel.textContent = hasAudioSource() ? 'Loading seekbar...' : 'Seek unavailable';
            seekStatusLabel.style.display = 'block';
        }
        seekBar.style.display = 'none';
        seekBar.disabled = true;
        seekBar.style.opacity = '0.45';
        seekBar.style.cursor = 'default';
        seekBar.value = '0';
    };

    const updatePlayPauseLabel = () => {
        if (!playPauseBtn) return;

        refreshIconButton(
            playPauseBtn,
            hasAudioSource() && audio && !audio.paused ? 'pause' : 'play',
            hasAudioSource() && audio && !audio.paused ? 'Pause' : 'Play'
        );
    };

    const updateControlState = () => {
        const canControlPlayback = hasAudioSource();
        const canDownload = allChunks.length > 0;

        setButtonEnabled(downloadBtn, canDownload);
        setButtonEnabled(playPauseBtn, canControlPlayback);
        setButtonEnabled(backBtn, canControlPlayback);
        setButtonEnabled(forwardBtn, canControlPlayback);
        setButtonEnabled(speedBtn, canControlPlayback);

        updateSpeedUi();
        updatePlayPauseLabel();
        updateTimeDisplay();
    };

    const applyPlaybackRate = (nextRate) => {
        playbackRate = nextRate;
        localStorage.setItem('ae_playbackRate', String(playbackRate));
        if (audio) audio.playbackRate = playbackRate;
        updateSpeedUi();
        closeSpeedMenu();
    };

    const downloadAudio = () => {
        if (!allChunks.length) return;
        const blob = new Blob(allChunks, { type: currentMimeType });
        const url = URL.createObjectURL(blob);
        const extension = currentMimeType.includes('mpeg')
            ? 'mp3'
            : currentMimeType.includes('wav')
                ? 'wav'
                : currentMimeType.includes('aac')
                    ? 'aac'
                    : 'bin';
        const a = Object.assign(document.createElement('a'), {
            href: url,
            download: `ChatGPT_Audio_${Date.now()}.${extension}`,
            style: 'display:none'
        });
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const stopUiSync = () => {
        if (!uiSyncIntervalId) return;
        clearInterval(uiSyncIntervalId);
        uiSyncIntervalId = null;
    };

    const teardownControls = () => {
        isCollapsed = false;
        closeSpeedMenu();
        stopUiSync();

        if (controlsDiv) {
            controlsDiv.remove();
            controlsDiv = null;
        }

        titleBarDiv = null;
        contentDiv = null;
        playPauseBtn = null;
        backBtn = null;
        forwardBtn = null;
        seekBar = null;
        seekStatusLabel = null;
        currentTimeLabel = null;
        timeSeparatorLabel = null;
        durationLabel = null;
        trackTitleLabel = null;
        downloadBtn = null;
        speedBtn = null;
        speedMenu = null;
        minimizeBtn = null;
    };

    const closePlayer = () => {
        const currentAudio = getObservedAudio() || audio;
        dismissedPlaybackKey = currentAudio && !currentAudio.paused ? getPlaybackKey(currentAudio) : null;

        if (currentAudio && !currentAudio.paused && !currentAudio.ended) {
            currentAudio.pause();
        }
        pauseOtherAudioElements(currentAudio);
        teardownControls();
    };

    const toggleCollapsed = () => {
        isCollapsed = !isCollapsed;
        if (contentDiv) contentDiv.style.display = isCollapsed ? 'none' : 'grid';
        if (titleBarDiv) titleBarDiv.style.borderRadius = isCollapsed ? '14px' : '14px 14px 0 0';
        if (minimizeBtn) {
            refreshIconButton(minimizeBtn, isCollapsed ? 'expand' : 'collapse', isCollapsed ? 'Show timeline' : 'Hide timeline');
        }
    };

    const beginDrag = (event) => {
        if (!controlsDiv || event.button !== 0) return;
        if (event.target.closest('button')) return;

        const rect = controlsDiv.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;

        controlsDiv.style.left = `${rect.left}px`;
        controlsDiv.style.top = `${rect.top}px`;
        controlsDiv.style.transform = 'none';

        const onMouseMove = (moveEvent) => {
            const width = controlsDiv.offsetWidth;
            const height = controlsDiv.offsetHeight;
            const nextLeft = Math.min(
                Math.max(12, moveEvent.clientX - offsetX),
                Math.max(12, window.innerWidth - width - 12)
            );
            const nextTop = Math.min(
                Math.max(12, moveEvent.clientY - offsetY),
                Math.max(12, window.innerHeight - height - 12)
            );

            controlsDiv.style.left = `${nextLeft}px`;
            controlsDiv.style.top = `${nextTop}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        event.preventDefault();
    };

    const createSpeedMenu = () => {
        speedMenu = document.createElement('div');
        speedMenu.style.cssText = [
            'position:absolute',
            'top:calc(100% + 8px)',
            'left:0',
            'display:none',
            'min-width:86px',
            'padding:6px',
            'border:1px solid rgba(255,255,255,0.18)',
            'border-radius:12px',
            'background:rgba(24,24,24,0.98)',
            'box-shadow:0 14px 28px rgba(0,0,0,0.34)',
            'z-index:2'
        ].join(';');

        speedOptions.forEach((rate) => {
            const optionBtn = document.createElement('button');
            optionBtn.type = 'button';
            optionBtn.dataset.rate = String(rate);
            optionBtn.textContent = formatRate(rate);
            optionBtn.style.cssText = `${nakedButtonStyle};display:block;width:100%;height:30px;padding:0 10px;border-radius:8px;text-align:left;font-size:13px;`;
            setButtonHoverState(optionBtn, 'rgba(255,255,255,0.1)');
            optionBtn.onclick = (event) => {
                event.stopPropagation();
                applyPlaybackRate(rate);
            };
            speedMenu.appendChild(optionBtn);
        });

        return speedMenu;
    };

    const buildControls = () => {
        if (controlsDiv) return;

        controlsDiv = document.createElement('div');
        controlsDiv.id = 'ae_enhanced_player';
        controlsDiv.style.cssText = [
            'position:fixed',
            'top:24px',
            'left:50%',
            'transform:translateX(-50%)',
            'z-index:2147483647',
            'width:min(560px, calc(100vw - 20px))',
            'border-radius:14px',
            'overflow:visible',
            'border:1px solid rgba(255,255,255,0.16)',
            'box-shadow:0 12px 28px rgba(0,0,0,0.34)',
            'color:#f2f0ea',
            'font-family:"Segoe UI", sans-serif',
            'font-size:14px',
            'background:#202123',
            'box-sizing:border-box'
        ].join(';');

        const titleBar = document.createElement('div');
        titleBar.style.cssText = [
            'display:grid',
            'grid-template-columns:minmax(0, 1fr) auto auto',
            'align-items:center',
            'gap:10px',
            'min-height:52px',
            'padding:7px 10px 7px 14px',
            'background:#202123',
            'border-radius:14px 14px 0 0',
            'cursor:move',
            'user-select:none',
            'box-sizing:border-box'
        ].join(';');
        titleBar.onmousedown = beginDrag;
        titleBarDiv = titleBar;

        trackTitleLabel = document.createElement('div');
        trackTitleLabel.style.cssText = 'min-width:0;font-size:15px;font-weight:650;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#e8e4da;';

        const playbackGroup = document.createElement('div');
        playbackGroup.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:6px;';

        const titleBarButtons = document.createElement('div');
        titleBarButtons.style.cssText = 'display:flex;align-items:center;gap:4px;';

        minimizeBtn = createIconButton('collapse', 'Hide timeline', 36);
        minimizeBtn.onclick = toggleCollapsed;

        const closeBtn = createIconButton('close', 'Close player', 36, 'rgba(255,95,86,0.18)');
        closeBtn.onclick = closePlayer;

        contentDiv = document.createElement('div');
        contentDiv.style.cssText = [
            'display:grid',
            'gap:4px',
            'padding:0 14px 8px',
            'background:#202123',
            'border-radius:0 0 14px 14px',
            'box-sizing:border-box'
        ].join(';');

        speedBtn = document.createElement('button');
        speedBtn.type = 'button';
        speedBtn.title = 'Playback speed';
        speedBtn.style.cssText = `${nakedButtonStyle};height:28px;min-width:58px;padding:0 10px;border-radius:999px;background:rgba(255,255,255,0.08);font-size:13px;font-weight:650;color:#fff5c7;text-align:center;`;
        setButtonHoverState(speedBtn, 'rgba(255,255,255,0.14)');
        speedBtn.onclick = (event) => {
            event.stopPropagation();
            if (!speedMenu) return;
            speedMenu.style.display = speedMenu.style.display === 'block' ? 'none' : 'block';
        };

        const leftTimesContainer = document.createElement('div');
        leftTimesContainer.style.cssText = 'position:relative;display:flex;align-items:center;';
        leftTimesContainer.append(speedBtn, createSpeedMenu());

        seekStatusLabel = document.createElement('div');
        seekStatusLabel.style.cssText = 'display:none;text-align:center;font-size:13px;color:#d7dce4;white-space:nowrap;';
        seekStatusLabel.textContent = 'Loading seekbar...';

        seekBar = document.createElement('input');
        seekBar.type = 'range';
        seekBar.min = '0';
        seekBar.max = '1000';
        seekBar.value = '0';
        seekBar.style.cssText = 'width:100%;height:12px;margin:0;accent-color:#fff5c7;cursor:pointer;';
        seekBar.oninput = () => {
            if (!audio || !hasKnownDuration()) return;
            audio.currentTime = (Number(seekBar.value) / 1000) * audio.duration;
        };

        const timesRow = document.createElement('div');
        timesRow.style.cssText = 'display:grid;grid-template-columns:auto minmax(0, 1fr) auto;align-items:center;font-size:13px;font-variant-numeric:tabular-nums;color:#d7dce4;gap:10px;min-height:28px;';

        const timeGroup = document.createElement('div');
        timeGroup.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:4px;min-width:0;white-space:nowrap;';

        currentTimeLabel = document.createElement('span');
        currentTimeLabel.style.cssText = 'text-align:right;';
        currentTimeLabel.textContent = '0:00';

        timeSeparatorLabel = document.createElement('span');
        timeSeparatorLabel.textContent = '/';
        timeSeparatorLabel.style.cssText = 'opacity:0.55;';

        durationLabel = document.createElement('span');
        durationLabel.style.cssText = 'text-align:left;';
        durationLabel.textContent = '--:--';

        timeGroup.append(currentTimeLabel, timeSeparatorLabel, durationLabel, seekStatusLabel);

        const rightGroup = document.createElement('div');
        rightGroup.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;';

        backBtn = createIconButton('backward', 'Back 5 seconds', 36);
        backBtn.onclick = () => {
            const currentAudio = getObservedAudio();
            if (!currentAudio) return;
            audio = currentAudio;
            audio.currentTime = Math.max(0, audio.currentTime - 5);
        };

        playPauseBtn = createIconButton('play', 'Play', 40);
        playPauseBtn.onclick = () => {
            const currentAudio = getObservedAudio();
            if (!currentAudio) {
                return;
            }

            audio = currentAudio;

            if (!hasAudioSource()) {
                return;
            }

            if (audio.paused) {
                pauseOtherAudioElements(audio);
                audio.play().catch(console.error);
                return;
            }
            audio.pause();
        };

        forwardBtn = createIconButton('forward', 'Forward 5 seconds', 36);
        forwardBtn.onclick = () => {
            const currentAudio = getObservedAudio();
            if (!currentAudio) return;
            audio = currentAudio;
            const maxDuration = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime + 5;
            audio.currentTime = Math.min(maxDuration, audio.currentTime + 5);
        };

        downloadBtn = createIconButton('download', 'Download audio', 36);
        downloadBtn.onclick = downloadAudio;

        playbackGroup.append(backBtn, playPauseBtn, forwardBtn);
        titleBarButtons.append(minimizeBtn, closeBtn);
        titleBar.append(trackTitleLabel, playbackGroup, titleBarButtons);
        rightGroup.append(downloadBtn);
        timesRow.append(leftTimesContainer, timeGroup, rightGroup);
        contentDiv.append(seekBar, timesRow);
        controlsDiv.append(titleBar, contentDiv);
        document.body.appendChild(controlsDiv);

        updateTrackTitle();
        updateSpeedUi();
        updateControlState();
    };

    const ensureBody = async () => {
        if (document.body) return;
        await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve, { once: true }));
    };

    const syncPlayerUi = () => {
        if (!controlsDiv) return;

        if (audio) audio.playbackRate = playbackRate;
        updateControlState();

        if (!hasAudioSource() && controlsDiv) {
            teardownControls();
        }
    };

    const startUiSync = () => {
        if (uiSyncIntervalId || document.visibilityState !== 'visible') return;
        uiSyncIntervalId = setInterval(syncPlayerUi, 100);
        syncPlayerUi();
    };

    const collectDownloadStream = async (response, streamId) => {
        try {
            if (response.body) {
                const reader = response.body.getReader();
                while (streamId === downloadStreamId) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    allChunks.push(value);
                }
            } else {
                const buffer = await response.arrayBuffer();
                if (streamId !== downloadStreamId) return;
                allChunks.push(new Uint8Array(buffer));
            }

            if (streamId === downloadStreamId) updateControlState();
        } catch (err) {
            if (streamId !== downloadStreamId || err?.name === 'AbortError') return;
            console.error('[Audio Enhancer] Download capture failed', err);
        }
    };

    const captureDownloadAudio = (response) => {
        downloadStreamId += 1;
        const streamId = downloadStreamId;
        currentMimeType = response.headers.get('content-type')?.split(';')[0] || 'audio/aac';
        allChunks = [];
        updateControlState();
        collectDownloadStream(response, streamId);
    };

    const getFetchUrl = (input) => {
        if (input instanceof Request) return input.url;
        if (input && typeof input === 'object' && 'url' in input) return input.url;
        return `${input || ''}`;
    };

    const isSpeechResponse = (url, response) => {
        if (/\/backend-api\/(?:synthesize|speech\/generation)(?:[/?#]|$)/.test(url)) return true;

        const contentType = response.headers.get('content-type') || '';
        return /^audio\//i.test(contentType) && /\/backend-api\//.test(url);
    };

    const checkObservedAudio = async () => {
        await ensureBody();

        const nextAudio = getObservedAudio();
        const previousKey = getPlaybackKey(audio);
        audio = nextAudio;

        if (audio) {
            audio.playbackRate = playbackRate;
        }

        const currentKey = getPlaybackKey(audio);
        if (currentKey && previousKey && currentKey !== previousKey) {
            dismissedPlaybackKey = null;
        }

        if (audio && !audio.paused && currentKey && currentKey !== trackTitlePlaybackKey) {
            captureTrackTitleForPlayback(currentKey);
        }

        if (!audio || !hasAudioSource()) {
            dismissedPlaybackKey = null;
            teardownControls();
            return;
        }

        if (audio.paused) {
            if (dismissedPlaybackKey === currentKey) dismissedPlaybackKey = null;
            if (controlsDiv) startUiSync();
            return;
        }

        if (dismissedPlaybackKey && dismissedPlaybackKey === currentKey) return;

        pauseOtherAudioElements(audio);
        buildControls();
        startUiSync();
    };

    const stopMonitoring = () => {
        if (monitorIntervalId) {
            clearInterval(monitorIntervalId);
            monitorIntervalId = null;
        }
        stopUiSync();
    };

    const startMonitoring = () => {
        if (document.visibilityState !== 'visible') return;
        if (!monitorIntervalId) {
            monitorIntervalId = setInterval(checkObservedAudio, 1000);
        }
        checkObservedAudio();
        if (controlsDiv) startUiSync();
    };

    const installAudioElementTracking = () => {
        if (audioTrackingInstalled) return;
        audioTrackingInstalled = true;

        document.querySelectorAll('audio').forEach(rememberAudioElement);

        const documentPrototype = typeof Document !== 'undefined' ? Document.prototype : null;
        const originalCreateElement = documentPrototype?.createElement;

        if (typeof originalCreateElement === 'function') {
            documentPrototype.createElement = function (...args) {
                const element = originalCreateElement.apply(this, args);
                if (`${args[0] || ''}`.toLowerCase() === 'audio') rememberAudioElement(element);
                return element;
            };
        }

        const mediaPrototype = typeof HTMLMediaElement !== 'undefined' ? HTMLMediaElement.prototype : null;
        const originalPlay = mediaPrototype?.play;

        if (typeof originalPlay === 'function') {
            mediaPrototype.play = function (...args) {
                const shouldTrack = isAudioElement(this);

                if (shouldTrack) {
                    rememberAudioElement(this);
                    pauseOtherAudioElements(this);
                    if (!controlsDiv) dismissedPlaybackKey = null;
                    audio = this;
                    startMonitoring();
                }

                const result = originalPlay.apply(this, args);

                if (shouldTrack) {
                    Promise.resolve(result).then(checkObservedAudio, checkObservedAudio);
                }

                return result;
            };
        }

        const originalPause = mediaPrototype?.pause;

        if (typeof originalPause === 'function') {
            mediaPrototype.pause = function (...args) {
                if (isAudioElement(this)) rememberAudioElement(this);
                const result = originalPause.apply(this, args);
                checkObservedAudio();
                return result;
            };
        }
    };

    const initializeTestMode = async () => {
        await ensureBody();
        captureTrackTitleForPlayback('test-mode');
        buildControls();
        updateTrackTitle();
        updateControlState();
    };

    document.addEventListener('click', (event) => {
        if (!speedMenu || !speedBtn) return;
        if (speedMenu.contains(event.target) || speedBtn.contains(event.target)) return;
        closeSpeedMenu();
    });

    if (isTestMode) {
        initializeTestMode();
        return;
    }

    installAudioElementTracking();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            startMonitoring();
            return;
        }
        stopMonitoring();
    });

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const res = await originalFetch.apply(this, args);
        const url = getFetchUrl(args[0]);

        if (isSpeechResponse(url, res)) {
            if (typeof res.clone === 'function') {
                captureDownloadAudio(res.clone());
            }
            startMonitoring();
        }
        return res;
    };

    startMonitoring();
})();
