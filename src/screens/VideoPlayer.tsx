import { VLCPlayer } from 'react-native-vlc-media-player';
import { View, TouchableOpacity, Text, SafeAreaView, Alert, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { scale } from 'react-native-size-matters';
import { Slider } from '@miblanchard/react-native-slider';
import { useEffect, useMemo, useRef, useState } from 'react';
import useStremio from '../hooks/useStremio';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated2, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
interface IVideoProgress {
  currentTime: number;
  duration: number;
  position: number;
  remainingTime: number;
}
const FADE_OUT_TRIGGER_LIMIT = 5000;
const VideoPlayer = ({ navigation, route }: any) => {
  const {
    url,
    activeEpisode,
    existingData,
    currentVideoPosition,
    updateCachedVideoPosition,
    isOffline,
  } = route.params || {};
  const { updateVideoPosition } = useStremio();
  const [paused, setPaused] = useState(false);
  const [videoProgress, setVideoProgress] = useState<IVideoProgress | null>(null);
  const lastUpdateSent = useRef<IVideoProgress | null>();
  const videoPlayerRef = useRef<any>();
  const [disableSliderUpdates, setDisableSliderUpdates] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [blockTouchEvents, setBlockTouchEvents] = useState(false);
  const lastServerUpdate = useRef<IVideoProgress | null>();
  const creationTime = useRef(existingData?._ctime || new Date().toISOString());
  const [textTracks, setTextTracks] = useState<any[]>([]);
  const [textTrack, setTextTrack] = useState<number>(-1);
  const [audioTracks, setAudioTracks] = useState<any[]>([]);
  const [audioTrack, setAudioTrack] = useState<number>(-1);
  const showErrorAlert = useRef(true);
  const savedScale = useSharedValue(1);
  const videoScale = useSharedValue(1);
  const fadeOutTimeout = useRef<NodeJS.Timeout>();
  const [enableControlToggle, setEnableControlToggle] = useState(true);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);

  useEffect(() => {
    if (currentVideoPosition > 0) {
      videoPlayerRef.current?.seek(currentVideoPosition);
    }
  }, []);

  const fadeIn = () => {
    clearTimeout(fadeOutTimeout.current);
    setBlockTouchEvents(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => {
      setShowControls(true);
      fadeOutTimeout.current = setTimeout(fadeOut, FADE_OUT_TRIGGER_LIMIT);
    });
  };
  const fadeOut = () => {
    clearTimeout(fadeOutTimeout.current);
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setShowControls(false);
      setBlockTouchEvents(true);
    });
  };

  const resetFadeTimeout = () => {
    clearTimeout(fadeOutTimeout.current);
    fadeOutTimeout.current = setTimeout(fadeOut, FADE_OUT_TRIGGER_LIMIT);
  };

  const formatTime = (time: number) => {
    const seconds = Math.floor(Math.abs(time) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(remainingSeconds).padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${formattedMinutes}:${formattedSeconds}`;
    } else {
      return `${minutes}:${formattedSeconds}`;
    }
  };

  const onSeekComplete = (completion: number) => {
    setTimeout(() => {
      setDisableSliderUpdates(false);
    }, 100);
    resetFadeTimeout();
    if (!videoProgress) return;
    videoPlayerRef.current?.seek(Math.min(completion, 0.9999));
  };

  const skipForward = () => {
    if (!videoProgress) return;
    resetFadeTimeout();
    const newTime = videoProgress.currentTime + 1000 * 10;
    const newPosition = newTime / videoProgress.duration;
    videoPlayerRef.current?.seek(Math.max(newPosition, 0));
  };

  const skipBackward = () => {
    if (!videoProgress) return;
    resetFadeTimeout();
    const newTime = videoProgress.currentTime - 1000 * 10;
    const newPosition = newTime / videoProgress.duration;
    videoPlayerRef.current?.seek(Math.max(newPosition, 0));
  };

  const sliderPosition = useMemo(() => {
    if (!videoProgress) return 0;
    return videoProgress.currentTime / videoProgress.duration;
  }, [videoProgress]);

  const [formattedCurrentTime, currentTimeContainerWidth] = useMemo(() => {
    const time = videoProgress ? formatTime(videoProgress.currentTime) : '--:--';
    const width = time.replaceAll(':', '').length * 10;
    return [time, width];
  }, [videoProgress]);

  const [formattedRemainingTime, remainingTimeContainerWidth] = useMemo(() => {
    const time = videoProgress
      ? `-${formatTime(videoProgress.duration - videoProgress.currentTime)}`
      : '--:--';
    const width = time.replaceAll(':', '').length * 10;
    return [time, width];
  }, [videoProgress]);

  const toggleControls = () => {
    if (!enableControlToggle) return;
    if (showControls) {
      fadeOut();
    } else {
      fadeIn();
    }
  };

  const handleVideoProgressUpdate = (value: IVideoProgress) => {
    if (
      !lastUpdateSent.current ||
      Math.abs(lastUpdateSent.current.currentTime - value.currentTime) > 500
    ) {
      setVideoProgress(value);
      updateCachedVideoPosition({ episodeId: activeEpisode, position: value.position });
      lastUpdateSent.current = value;
    }

    if (isOffline || !existingData) return;

    if (
      !lastServerUpdate.current ||
      Math.abs(lastServerUpdate.current.currentTime - value.currentTime) > 5000
    ) {
      updateVideoPosition({
        id: existingData.id,
        videoId: activeEpisode,
        name: existingData.name,
        type: existingData.type,
        poster: existingData.poster,
        timeWatched: value.currentTime,
        duration: value.duration,
        creationTime: creationTime.current,
      }).catch((e: any) => console.warn(e));
      lastServerUpdate.current = value;
    }
  };

  const onLoad = (e: any) => {
    setTextTrack(-1);
    if (e.textTracks) {
      setTextTracks(e.textTracks);
    }
    if (e.audioTracks) {
      setAudioTracks(e.audioTracks);
    }
  };

  const onVideoFailed = () => {
    if (!showErrorAlert.current) return;
    showErrorAlert.current = false;
    Alert.alert('Error', 'Video failed to load', [
      {
        text: 'OK',
        onPress: () => navigation.goBack(),
      },
    ]);
  };

  useEffect(() => {
    return () => {
      showErrorAlert.current = false;
    };
  }, []);

  const onPinchEvent = (enable: boolean, timeout: number) => {
    setTimeout(() => {
      setEnableControlToggle(enable);
    }, timeout);
  };

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      runOnJS(onPinchEvent)(false, 0);
    })
    .onUpdate(e => {
      videoScale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      runOnJS(onPinchEvent)(true, 100);
      savedScale.value = videoScale.value;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: videoScale.value }],
    flex: 1,
  }));

  const handleSubtitleSettingsPress = () => {
    if (showSubtitleSettings) {
      resetFadeTimeout();
      setShowSubtitleSettings(false);
    } else {
      clearTimeout(fadeOutTimeout.current);
      setShowSubtitleSettings(true);
    }
  };

  return (
    <TouchableOpacity className="flex-1 bg-black" activeOpacity={1} onPress={toggleControls}>
      <Animated2.View style={[animatedStyle]}>
        <VLCPlayer
          ref={videoPlayerRef}
          style={{ flex: 1, backgroundColor: 'black' }}
          source={{
            uri: url,
          }}
          repeat={false}
          playInBackground={true}
          autoAspectRatio={true}
          onError={() => onVideoFailed()}
          onProgress={!disableSliderUpdates ? handleVideoProgressUpdate : undefined}
          paused={paused}
          textTrack={textTrack}
          audioTrack={audioTrack}
          muted={false}
          onLoad={onLoad}
        />
      </Animated2.View>

      <GestureDetector gesture={pinchGesture}>
        <Animated.View
          className={'z-[90] absolute w-full h-full'}
          style={{
            opacity: fadeAnim,
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}>
          <SafeAreaView className="flex-1" style={{ display: blockTouchEvents ? 'none' : 'flex' }}>
            <View className="flex-1 justify-between p-[5vw] pb-[5px] items-center">
              <View className="w-full justify-between flex-row">
                <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.5}>
                  <Ionicons name="close" size={scale(30)} color={'rgba(255,255,255,0.7)'} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSubtitleSettingsPress}
                  activeOpacity={0.5}
                  className={showSubtitleSettings ? 'bg-white/30 rounded-full p-1' : 'p-1'}>
                  <Ionicons
                    name="settings-outline"
                    size={scale(25)}
                    color={'rgba(255,255,255,0.7)'}
                  />
                </TouchableOpacity>
              </View>

              {showSubtitleSettings && (
                <View className="absolute right-[5vw] top-[70] z-50">
                  <View className="bg-black/80 rounded-lg p-4">
                    <View className="flex-row space-x-4">
                      <View className="space-y-2">
                        <Text className="text-white/70 mb-2">Subtitle Track</Text>
                        {!textTracks.some(track => track.id === -1) && (
                          <TouchableOpacity
                            onPress={() => setTextTrack(-1)}
                            className={`px-3 py-2 rounded ${
                              textTrack === -1 ? 'bg-white/30' : 'bg-white/10'
                            }`}>
                            <Text className="text-white max-w-[150px]" numberOfLines={1}>
                              Off
                            </Text>
                          </TouchableOpacity>
                        )}
                        {textTracks.map((track, index) => (
                          <TouchableOpacity
                            key={index}
                            onPress={() => setTextTrack(track.id)}
                            className={`px-3 py-2 rounded ${
                              textTrack === track.id ? 'bg-white/30' : 'bg-white/10'
                            }`}>
                            <Text className="text-white max-w-[150px]" numberOfLines={1}>
                              {track.name || `Track ${index + 1}`}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <View className="space-y-2">
                        <Text className="text-white/70 mb-2">Audio Track</Text>
                        {audioTracks.map((track, index) => (
                          <TouchableOpacity
                            key={index}
                            onPress={() => setAudioTrack(track.id)}
                            className={`px-3 py-2 rounded ${
                              audioTrack === track.id ? 'bg-white/30' : 'bg-white/10'
                            }`}>
                            <Text className="text-white max-w-[150px]" numberOfLines={1}>
                              {track.name || `Audio ${index + 1}`}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
              )}

              <View
                className="w-full justify-evenly flex-row items-center absolute top-0 bottom-0"
                pointerEvents="box-none">
                <TouchableOpacity onPress={skipBackward} activeOpacity={0.5}>
                  <Ionicons name={'play-back'} size={scale(30)} color={'rgba(255,255,255,0.7)'} />
                </TouchableOpacity>
                <View>
                  <TouchableOpacity onPress={() => setPaused(p => !p)} activeOpacity={0.5}>
                    <Ionicons
                      name={paused ? 'play' : 'pause'}
                      size={scale(50)}
                      color={'rgba(255,255,255,0.7)'}
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={skipForward} activeOpacity={0.5}>
                  <Ionicons
                    name={'play-forward'}
                    size={scale(30)}
                    color={'rgba(255,255,255,0.7)'}
                  />
                </TouchableOpacity>
              </View>

              <View className="w-[100%] h-[45px] rounded-[15px] overflow-hidden">
                <View className="items-center flex-row space-x-3 flex-1">
                  <View style={{ minWidth: currentTimeContainerWidth }} className="items-center">
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                      {formattedCurrentTime}
                    </Text>
                  </View>

                  <Slider
                    containerStyle={{ flex: 1, marginLeft: 15 }}
                    minimumValue={0}
                    maximumValue={1}
                    onSlidingStart={() => setDisableSliderUpdates(true)}
                    onSlidingComplete={(v: any) => onSeekComplete(v[0])}
                    value={sliderPosition}
                    minimumTrackStyle={{ backgroundColor: 'rgba(255,255,255,0.7)' }}
                    maximumTrackStyle={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                    thumbStyle={{ backgroundColor: 'rgba(255,255,255,1)', height: 12, width: 12 }}
                  />
                  <View style={{ minWidth: remainingTimeContainerWidth }}>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                      {formattedRemainingTime}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>
      </GestureDetector>
    </TouchableOpacity>
  );
};

export default VideoPlayer;
