// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const { useNavigate } = require('react-router');
const { default: toPath } = require('stremio-router/toPath');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { useTranslation } = require('react-i18next');
const { default: Icon } = require('@stremio/stremio-icons/react');
const { Button, Image, MultiselectMenu } = require('stremio/components');
const { useCore } = require('stremio/core');
const Stream = require('./Stream');
const styles = require('./styles');
const { usePlatform, useProfile } = require('stremio/common');
const { default: SeasonEpisodePicker } = require('../EpisodePicker');

const ALL_ADDONS_KEY = 'ALL';
const STREAM_FILTER_ALL = 'all';
const STREAM_FILTER_LAST = 'last';
const STREAM_FILTER_RD = 'rd';
const STREAM_FILTER_4K = '4k';
const STREAM_FILTER_1080P = '1080p';
const STREAM_FILTER_CAPTIONS = 'captions';
const STREAM_FILTER_SMALL = 'small';
const STREAM_FILTER_SEEDS = 'seeds';
const LAST_STREAMS_STORAGE_KEY = 'jaxf:last-stream-by-video';

const readLastStreams = () => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return {};
    }

    try {
        return JSON.parse(window.localStorage.getItem(LAST_STREAMS_STORAGE_KEY)) || {};
    } catch (error) {
        return {};
    }
};

const writeLastStreams = (value) => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    try {
        window.localStorage.setItem(LAST_STREAMS_STORAGE_KEY, JSON.stringify(value));
    } catch (error) {
        // Ignore storage errors so stream playback is never blocked.
    }
};

const getVideoKey = (video, type) => {
    if (!video) {
        return null;
    }

    const baseId = [
        video.id,
        video.videoId,
        video.metaId,
        video.imdb_id,
        video.imdbId,
        video?.deepLinks?.metaDetailsStreams,
        video?.deepLinks?.metaDetailsVideos,
        video.title ? `${type || 'meta'}:${video.title}:${video.released || video.year || ''}` : null
    ].find((value) => typeof value === 'string' && value.length > 0);

    if (!baseId) {
        return null;
    }

    if (typeof video.season === 'number' && typeof video.episode === 'number') {
        return `${baseId}:s${video.season}:e${video.episode}`;
    }

    return baseId;
};

const normalizeStreamValue = (value) => String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[|]+/g, ' ')
    .trim();

const getStreamKey = (stream) => {
    const deepLinks = stream?.deepLinks || {};
    const externalPlayer = deepLinks.externalPlayer || {};

    return [
        stream?.addonName,
        stream?.name,
        stream?.description,
        stream?.title,
        stream?.infoHash,
        stream?.fileIdx,
        stream?.url,
        stream?.ytId,
        deepLinks.player,
        externalPlayer.magnet,
        externalPlayer.streaming,
        externalPlayer.download,
        externalPlayer.playlist,
        externalPlayer.web,
        externalPlayer.fileName
    ]
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map((value) => String(value))
        .join('|');
};

const getStreamFingerprints = (stream) => {
    const addonName = normalizeStreamValue(stream?.addonName);
    const name = normalizeStreamValue(stream?.name);
    const description = normalizeStreamValue(stream?.description);
    const title = normalizeStreamValue(stream?.title);
    const infoHash = normalizeStreamValue(stream?.infoHash);
    const deepLinks = stream?.deepLinks || {};
    const externalPlayer = deepLinks.externalPlayer || {};

    return [
        [addonName, name, description].filter(Boolean).join('|'),
        [addonName, description].filter(Boolean).join('|'),
        [name, description].filter(Boolean).join('|'),
        [title, description].filter(Boolean).join('|'),
        [addonName, infoHash].filter(Boolean).join('|'),
        normalizeStreamValue(deepLinks.player),
        normalizeStreamValue(externalPlayer.magnet),
        normalizeStreamValue(externalPlayer.streaming),
        normalizeStreamValue(externalPlayer.download),
        normalizeStreamValue(externalPlayer.playlist),
        normalizeStreamValue(externalPlayer.web)
    ].filter(Boolean);
};


const getStreamSearchText = (stream) => normalizeStreamValue([
    stream?.addonName,
    stream?.name,
    stream?.description,
    stream?.title
].filter(Boolean).join(' '));

const getStreamFileSizeGB = (stream) => {
    const text = `${stream?.description || ''} ${stream?.name || ''}`;
    const gbMatch = text.match(/(\d+(?:\.\d+)?)\s*gb/i);
    const mbMatch = text.match(/(\d+(?:\.\d+)?)\s*mb/i);

    if (gbMatch) {
        return Number(gbMatch[1]);
    }

    if (mbMatch) {
        return Number(mbMatch[1]) / 1024;
    }

    return Number.POSITIVE_INFINITY;
};

const getStreamSeeds = (stream) => {
    const text = `${stream?.description || ''} ${stream?.name || ''}`;
    const explicit = text.match(/(?:👥|seeders?|seeds?|peers?)\s*[: ]\s*(\d+)/i) || text.match(/(\d+)\s*(?:seeders?|seeds?|peers?)/i);

    if (explicit) {
        return Number(explicit[1]);
    }

    const emojiLine = text.match(/👥\s*(\d+)/);
    return emojiLine ? Number(emojiLine[1]) : 0;
};

const streamMatchesFilter = (stream, filter) => {
    const text = getStreamSearchText(stream);

    switch (filter) {
        case STREAM_FILTER_LAST:
            return stream.isLastUsedStream;
        case STREAM_FILTER_RD:
            return /\brd\b|real\s*debrid|debrid/.test(text);
        case STREAM_FILTER_4K:
            return /\b4k\b|2160p|uhd/.test(text);
        case STREAM_FILTER_1080P:
            return /1080p|full\s*hd/.test(text);
        case STREAM_FILTER_CAPTIONS:
            return /subtitles?|subs?|caption|cc|multi|dual|eng|english|🇬🇧|🇺🇸/.test(text);
        case STREAM_FILTER_SMALL:
            return getStreamFileSizeGB(stream) <= 10;
        case STREAM_FILTER_SEEDS:
            return getStreamSeeds(stream) > 0;
        case STREAM_FILTER_ALL:
        default:
            return true;
    }
};

const sortStreams = (streamA, streamB) => {
    if (streamA.isLastUsedStream !== streamB.isLastUsedStream) {
        return streamA.isLastUsedStream ? -1 : 1;
    }

    const seedDiff = getStreamSeeds(streamB) - getStreamSeeds(streamA);
    if (seedDiff !== 0) {
        return seedDiff;
    }

    return getStreamFileSizeGB(streamA) - getStreamFileSizeGB(streamB);
};

const encodeStreamPayload = (stream) => {
    try {
        return encodeURIComponent(JSON.stringify({
            streamKey: getStreamKey(stream),
            fingerprints: getStreamFingerprints(stream),
            addonName: stream.addonName,
            name: stream.name,
            description: stream.description,
            clickedAt: Date.now()
        }));
    } catch (error) {
        return '';
    }
};

const isSameLastStream = (stream, lastStreamForVideo) => {
    if (!stream || !lastStreamForVideo) {
        return false;
    }

    const streamKey = getStreamKey(stream);

    if (streamKey && streamKey === lastStreamForVideo.streamKey) {
        return true;
    }

    const fingerprints = getStreamFingerprints(stream);
    const savedFingerprints = Array.isArray(lastStreamForVideo.fingerprints) ? lastStreamForVideo.fingerprints : [];

    return fingerprints.some((fingerprint) => savedFingerprints.includes(fingerprint));
};

const StreamsList = ({ className, video, type, onEpisodeSearch, ...props }) => {
    const { t } = useTranslation();
    const core = useCore();
    const platform = usePlatform();
    const profile = useProfile();
    const navigate = useNavigate();
    const streamsContainerRef = React.useRef(null);
    const [selectedAddon, setSelectedAddon] = React.useState(ALL_ADDONS_KEY);
    const [selectedFilter, setSelectedFilter] = React.useState(STREAM_FILTER_ALL);
    const [lastStreamsByVideo, setLastStreamsByVideo] = React.useState(readLastStreams);

    const videoKey = React.useMemo(() => getVideoKey(video, type), [video, type]);
    const lastStreamForVideo = React.useMemo(() => {
        return videoKey ? lastStreamsByVideo[videoKey] : null;
    }, [lastStreamsByVideo, videoKey]);

    const saveLastStream = React.useCallback((stream) => {
        if (!videoKey) {
            return;
        }

        const streamKey = getStreamKey(stream);
        const fingerprints = getStreamFingerprints(stream);

        if (!streamKey && fingerprints.length === 0) {
            return;
        }

        const savedStream = {
            streamKey,
            fingerprints,
            addonName: stream.addonName,
            name: stream.name,
            description: stream.description,
            clickedAt: Date.now()
        };

        const currentValue = readLastStreams();
        const nextValue = {
            ...currentValue,
            [videoKey]: savedStream
        };

        writeLastStreams(nextValue);
        setLastStreamsByVideo(nextValue);
    }, [videoKey]);


    React.useEffect(() => {
        if (!videoKey || typeof document === 'undefined') {
            return undefined;
        }

        const handleStreamPointer = (event) => {
            const target = event.target?.closest?.('[data-jaxf-stream-payload]');

            if (!target || !target.dataset.jaxfStreamPayload) {
                return;
            }

            try {
                const savedStream = JSON.parse(decodeURIComponent(target.dataset.jaxfStreamPayload));
                const currentValue = readLastStreams();
                const nextValue = {
                    ...currentValue,
                    [videoKey]: savedStream
                };

                writeLastStreams(nextValue);
                setLastStreamsByVideo(nextValue);
            } catch (error) {
                // Do not interrupt stream playback if the helper payload is malformed.
            }
        };

        document.addEventListener('pointerdown', handleStreamPointer, true);
        document.addEventListener('click', handleStreamPointer, true);

        return () => {
            document.removeEventListener('pointerdown', handleStreamPointer, true);
            document.removeEventListener('click', handleStreamPointer, true);
        };
    }, [videoKey]);

    const onAddonSelected = React.useCallback((value) => {
        streamsContainerRef.current?.scrollTo({
            top: 0,
            left: 0,
            behavior: platform.name === 'ios' ? 'smooth' : 'instant'
        });
        setSelectedAddon(value);
    }, [platform]);

    const showInstallAddonsButton = React.useMemo(() => {
        return !profile || profile.auth === null || profile.auth?.user?.isNewUser === true && !video?.upcoming;
    }, [profile, video]);

    const backButtonOnClick = React.useCallback(() => {
        if (video.deepLinks && typeof video.deepLinks.metaDetailsVideos === 'string') {
            const navigateTo = `${video.deepLinks.metaDetailsVideos}${
                typeof video.season === 'number'
                    ? `?${new URLSearchParams({ 'season': video.season })}`
                    : ''}`;
            navigate(toPath(navigateTo), { replace: true });
        } else {
            navigate(-1);
        }
    }, [video]);

    const countLoadingAddons = React.useMemo(() => {
        return props.streams.filter((stream) => stream.content.type === 'Loading').length;
    }, [props.streams]);

    const streamsByAddon = React.useMemo(() => {
        return props.streams
            .filter((streams) => streams.content.type === 'Ready')
            .reduce((streamsByAddon, streams) => {
                streamsByAddon[streams.addon.transportUrl] = {
                    addon: streams.addon,
                    streams: streams.content.content.map((stream) => {
                        const nextStream = {
                            ...stream,
                            addonName: streams.addon.manifest.name
                        };

                        const streamKey = getStreamKey(nextStream);
                        const isLastUsedStream = isSameLastStream(nextStream, lastStreamForVideo);

                        return {
                            ...nextStream,
                            streamKey,
                            isLastUsedStream,
                            onSelect: () => {
                                saveLastStream(nextStream);
                            },
                            onClick: () => {
                                saveLastStream(nextStream);

                                core.transport.analytics({
                                    event: 'StreamClicked',
                                    args: {
                                        stream
                                    }
                                });
                            }
                        };
                    })
                };
                return streamsByAddon;
            }, {});
    }, [props.streams, core, lastStreamForVideo, saveLastStream]);

    const filteredStreams = React.useMemo(() => {
        const streams = selectedAddon === ALL_ADDONS_KEY ?
            Object.values(streamsByAddon).map(({ streams }) => streams).flat(1)
            :
            streamsByAddon[selectedAddon] ?
                streamsByAddon[selectedAddon].streams
                :
                [];

        return streams
            .filter((stream) => streamMatchesFilter(stream, selectedFilter))
            .slice()
            .sort(sortStreams);
    }, [streamsByAddon, selectedAddon, selectedFilter]);

    const streamFilters = React.useMemo(() => ([
        { value: STREAM_FILTER_ALL, label: 'All' },
        { value: STREAM_FILTER_LAST, label: '★ Last' },
        { value: STREAM_FILTER_RD, label: 'RD only' },
        { value: STREAM_FILTER_4K, label: '4K' },
        { value: STREAM_FILTER_1080P, label: '1080p' },
        { value: STREAM_FILTER_CAPTIONS, label: 'Captions' },
        { value: STREAM_FILTER_SMALL, label: '< 10 GB' },
        { value: STREAM_FILTER_SEEDS, label: 'Seeds' }
    ]), []);

    const selectableOptions = React.useMemo(() => {
        return {
            options: [
                {
                    value: ALL_ADDONS_KEY,
                    label: t('ALL_ADDONS'),
                    title: t('ALL_ADDONS')
                },
                ...Object.keys(streamsByAddon).map((transportUrl) => ({
                    value: transportUrl,
                    label: streamsByAddon[transportUrl].addon.manifest.name,
                    title: streamsByAddon[transportUrl].addon.manifest.name,
                }))
            ],
            value: selectedAddon,
            onSelect: onAddonSelected
        };
    }, [streamsByAddon, selectedAddon, onAddonSelected, t]);

    const handleEpisodePicker = React.useCallback((season, episode) => {
        onEpisodeSearch(season, episode);
    }, [onEpisodeSearch]);

    const createSaveLastStreamHandler = React.useCallback((stream) => () => {
        saveLastStream(stream);
    }, [saveLastStream]);

    return (
        <div className={classnames(className, styles['streams-list-container'])}>
            <div className={styles['select-choices-wrapper']}>
                {
                    video ?
                        <React.Fragment>
                            <Button className={classnames(styles['button-container'], styles['back-button-container'])} tabIndex={0} onClick={backButtonOnClick}>
                                <Icon className={styles['icon']} name={'chevron-back'} />
                            </Button>
                            <div className={styles['episode-title']}>
                                {typeof video.season === 'number' && typeof video.episode === 'number'
                                    ? `S${video.season}E${video.episode}${video.title ? ` ${video.title}` : ''}`
                                    : (video.title ?? '')}
                            </div>
                        </React.Fragment>
                        :
                        null
                }
                {
                    Object.keys(streamsByAddon).length > 1 ?
                        <MultiselectMenu
                            {...selectableOptions}
                            className={styles['select-input-container']}
                        />
                        :
                        null
                }
            </div>
            {
                props.streams.length > 0 ?
                    <div className={styles['stream-filter-bar']}>
                        {streamFilters.map((filter) => (
                            <Button
                                key={filter.value}
                                className={classnames(styles['stream-filter-pill'], { [styles['selected-stream-filter-pill']]: selectedFilter === filter.value })}
                                title={filter.label}
                                onClick={() => setSelectedFilter(filter.value)}
                            >
                                <span>{filter.label}</span>
                            </Button>
                        ))}
                    </div>
                    :
                    null
            }
            {
                props.streams.length === 0 ?
                    <div className={styles['message-container']}>
                        {
                            type === 'series' ?
                                <SeasonEpisodePicker className={styles['search']} onSubmit={handleEpisodePicker} />
                                : null
                        }
                        <Image className={styles['image']} src={require('/assets/images/empty.png')} alt={' '} />
                        <div className={styles['label']}>{t('ERR_NO_ADDONS_FOR_STREAMS')}</div>
                    </div>
                    :
                    props.streams.every((streams) => streams.content.type === 'Err') ?
                        <div className={styles['message-container']}>
                            {
                                type === 'series' ?
                                    <SeasonEpisodePicker className={styles['search']} onSubmit={handleEpisodePicker} />
                                    : null
                            }
                            {
                                video?.upcoming ?
                                    <div className={styles['label']}>{t('UPCOMING')}...</div>
                                    : null
                            }
                            <Image className={styles['image']} src={require('/assets/images/empty.png')} alt={' '} />
                            <div className={styles['label']}>{t('NO_STREAM')}</div>
                            {
                                showInstallAddonsButton ?
                                    <Button className={styles['install-button-container']} title={t('ADDON_CATALOGUE_MORE')} href={'#/addons'}>
                                        <Icon className={styles['icon']} name={'addons'} />
                                        <div className={styles['label']}>{t('ADDON_CATALOGUE_MORE')}</div>
                                    </Button>
                                    :
                                    null
                            }
                        </div>
                        :
                        filteredStreams.length === 0 ?
                            <div className={styles['streams-container']}>
                                <Stream.Placeholder />
                                <Stream.Placeholder />
                            </div>
                            :
                            <React.Fragment>
                                <div className={styles['streams-container']} ref={streamsContainerRef}>
                                    {filteredStreams.map((stream, index) => {
                                        const saveStream = createSaveLastStreamHandler(stream);

                                        return (
                                            <div
                                                key={`${stream.streamKey || 'stream'}-${index}`}
                                                className={classnames(styles['stream-wrapper'], { [styles['last-used-stream-wrapper']]: stream.isLastUsedStream })}
                                                data-last-used-stream={stream.isLastUsedStream ? 'true' : 'false'}
                                                data-jaxf-stream-key={stream.streamKey}
                                                data-jaxf-stream-payload={encodeStreamPayload(stream)}
                                                onPointerDownCapture={saveStream}
                                                onMouseDownCapture={saveStream}
                                                onTouchStartCapture={saveStream}
                                                onClickCapture={saveStream}
                                            >
                                                {
                                                    stream.isLastUsedStream ?
                                                        <div className={styles['last-used-stream-banner']}>★ Last used stream</div>
                                                        :
                                                        null
                                                }
                                                <Stream
                                                    videoId={video?.id}
                                                    videoReleased={video?.released}
                                                    addonName={stream.addonName}
                                                    name={stream.name}
                                                    description={stream.description}
                                                    thumbnail={stream.thumbnail}
                                                    progress={stream.progress}
                                                    deepLinks={stream.deepLinks}
                                                    isLastUsedStream={stream.isLastUsedStream}
                                                    onSelect={stream.onSelect}
                                                    onClick={stream.onClick}
                                                />
                                            </div>
                                        );
                                    })}
                                    {
                                        showInstallAddonsButton ?
                                            <Button className={styles['install-button-container']} title={t('ADDON_CATALOGUE_MORE')} href={'#/addons'}>
                                                <Icon className={styles['icon']} name={'addons'} />
                                                <div className={styles['label']}>{t('ADDON_CATALOGUE_MORE')}</div>
                                            </Button>
                                            :
                                            null
                                    }
                                </div>
                                {
                                    countLoadingAddons > 0 ?
                                        <div className={styles['addons-loading-container']}>
                                            <div className={styles['addons-loading']}>
                                                {countLoadingAddons} {t('MOBILE_ADDONS_LOADING')}
                                            </div>
                                            <span className={styles['addons-loading-bar']}></span>
                                        </div>
                                        :
                                        null
                                }
                            </React.Fragment>
            }
        </div>
    );
};

StreamsList.propTypes = {
    className: PropTypes.string,
    streams: PropTypes.arrayOf(PropTypes.object).isRequired,
    video: PropTypes.object,
    type: PropTypes.string,
    onEpisodeSearch: PropTypes.func
};

module.exports = StreamsList;
