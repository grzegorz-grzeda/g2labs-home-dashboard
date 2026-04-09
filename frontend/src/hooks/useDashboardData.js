import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  createLocation,
  deleteLocation,
  getCurrentReadings,
  getHistory,
  getLocations,
  updateLocation,
} from '../api';
import { ROUTES } from '../router';

export function useDashboardData({ authState, currentUserContext, route }) {
  const [status, setStatus] = useState({ text: 'Disconnected', kind: 'disconnected' });
  const [locations, setLocations] = useState([]);
  const [currentReadings, setCurrentReadings] = useState({});
  const [historiesByLocation, setHistoriesByLocation] = useState({});
  const [rangeHours, setRangeHours] = useState('24');
  const [locationsError, setLocationsError] = useState('');
  const [locationDraft, setLocationDraft] = useState({ name: '', sensorMac: '', groupId: '' });
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [editLocationDrafts, setEditLocationDrafts] = useState({});
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState({});
  const socketRef = useRef(null);
  const updateTimersRef = useRef({});

  const loadLocations = useCallback(async () => {
    const nextLocations = await getLocations();
    setLocations(nextLocations);
    setLocationDraft(draft => ({
      ...draft,
      groupId: nextLocations[0]?.groupId || draft.groupId || currentUserContext?.groups[0]?._id || '',
    }));
    return nextLocations;
  }, [currentUserContext?.groups]);

  const reloadDashboard = useCallback(async () => {
    setLocationsError('');
    setCurrentReadings({});
    setHistoriesByLocation({});

    const nextLocations = await loadLocations();
    const current = await getCurrentReadings();
    const nextReadings = {};

    current.forEach(({ location, reading }) => {
      if (reading) {
        nextReadings[location._id] = {
          locationId: location._id,
          locationName: location.name,
          ...reading,
        };
      }
    });

    setCurrentReadings(nextReadings);
    return nextLocations;
  }, [loadLocations]);

  const loadAllCharts = useCallback(async () => {
    const histories = await Promise.all(
      locations.map(location => getHistory(location._id, rangeHours))
    );
    const next = {};
    locations.forEach((location, index) => {
      next[location._id] = histories[index];
    });
    setHistoriesByLocation(next);
  }, [locations, rangeHours]);

  const connectSocket = useCallback(() => {
    socketRef.current?.disconnect();
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => setStatus({ text: 'Live', kind: 'connected' }));
    socket.on('disconnect', () => setStatus({ text: 'Disconnected', kind: 'disconnected' }));
    socket.on('connect_error', error => {
      console.error('Socket connection error:', error.message);
      setStatus({ text: 'Connection Error', kind: 'disconnected' });
    });
    socket.on('reading', reading => {
      setCurrentReadings(previous => ({
        ...previous,
        [reading.locationId]: reading,
      }));
      setHistoriesByLocation(previous => {
        const existing = previous[reading.locationId];
        if (!existing) return previous;
        return {
          ...previous,
          [reading.locationId]: [...existing, reading],
        };
      });
      setRecentlyUpdatedIds(previous => ({ ...previous, [reading.locationId]: true }));
      clearTimeout(updateTimersRef.current[reading.locationId]);
      updateTimersRef.current[reading.locationId] = setTimeout(() => {
        setRecentlyUpdatedIds(previous => {
          const next = { ...previous };
          delete next[reading.locationId];
          return next;
        });
      }, 1500);
    });
  }, []);

  useEffect(() => {
    if (authState !== 'authenticated' || !currentUserContext?.user?._id) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setStatus({ text: 'Disconnected', kind: 'disconnected' });
      setLocations([]);
      setCurrentReadings({});
      setHistoriesByLocation({});
      return;
    }

    let cancelled = false;

    async function bootstrapDashboard() {
      try {
        await reloadDashboard();
        if (!cancelled) connectSocket();
      } catch (error) {
        if (!cancelled) {
          setLocationsError(error.error || error.message || 'Failed to load dashboard');
          setStatus({ text: 'Connection Error', kind: 'disconnected' });
        }
      }
    }

    bootstrapDashboard();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [authState, currentUserContext?.user?._id, reloadDashboard, connectSocket]);

  useEffect(() => {
    if (authState !== 'authenticated' || locations.length === 0 || route !== ROUTES.dashboard) return;
    loadAllCharts();
  }, [authState, locations, route, loadAllCharts]);

  useEffect(() => () => {
    socketRef.current?.disconnect();
    Object.values(updateTimersRef.current).forEach(timeout => clearTimeout(timeout));
  }, []);

  const handleAddLocation = useCallback(async () => {
    try {
      await createLocation(locationDraft);
      setLocationsError('');
      setLocationDraft(draft => ({ ...draft, name: '', sensorMac: '' }));
      await loadLocations();
    } catch (error) {
      setLocationsError(error.error || error.message);
    }
  }, [locationDraft, loadLocations]);

  const handleSaveLocation = useCallback(async id => {
    const draft = editLocationDrafts[id];
    try {
      await updateLocation(id, draft);
      setLocationsError('');
      setEditingLocationId(null);
      await loadLocations();
    } catch (error) {
      setLocationsError(error.error || error.message);
    }
  }, [editLocationDrafts, loadLocations]);

  const handleDeleteLocation = useCallback(async id => {
    if (!window.confirm('Delete this location and all its readings?')) return;
    try {
      await deleteLocation(id);
      await loadLocations();
    } catch (error) {
      setLocationsError(error.error || error.message);
    }
  }, [loadLocations]);

  const scales = useMemo(() => {
    const allHistoryPoints = Object.values(historiesByLocation)
      .flat()
      .filter(point => typeof point.temperature === 'number' && typeof point.humidity === 'number');

    if (allHistoryPoints.length === 0) return null;

    return {
      tempMin: Math.floor(Math.min(...allHistoryPoints.map(point => point.temperature))) - 5,
      tempMax: Math.ceil(Math.max(...allHistoryPoints.map(point => point.temperature))) + 5,
      humidMin: Math.floor(Math.min(...allHistoryPoints.map(point => point.humidity))) - 5,
      humidMax: Math.ceil(Math.max(...allHistoryPoints.map(point => point.humidity))) + 5,
    };
  }, [historiesByLocation]);

  return {
    status,
    locations,
    currentReadings,
    historiesByLocation,
    rangeHours,
    setRangeHours,
    locationsError,
    locationDraft,
    setLocationDraft,
    editingLocationId,
    setEditingLocationId,
    editLocationDrafts,
    setEditLocationDrafts,
    recentlyUpdatedIds,
    scales,
    loadLocations,
    handleAddLocation,
    handleSaveLocation,
    handleDeleteLocation,
  };
}
