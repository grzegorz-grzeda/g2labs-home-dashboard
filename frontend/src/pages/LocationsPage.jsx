import React from 'react';
import PageIntro from '../components/PageIntro';

export default function LocationsPage({
  locations,
  currentUserContext,
  editingLocationId,
  setEditingLocationId,
  editLocationDrafts,
  setEditLocationDrafts,
  handleSaveLocation,
  handleDeleteLocation,
  locationDraft,
  setLocationDraft,
  handleAddLocation,
  locationsError,
}) {
  const groups = currentUserContext?.groups || [];

  return (
    <>
      <PageIntro
        eyebrow="Management"
        title="Sensor locations"
        description="Match physical sensors to the rooms and groups your household actually uses."
        stats={[
          { label: 'Managed locations', value: locations.length, note: 'Existing room assignments' },
          { label: 'Visible groups', value: groups.length, note: 'Available assignment targets' },
          { label: 'Editable today', value: locations.filter(location => groups.some(group => group._id === location.groupId)).length, note: 'Locations you can modify now' },
        ]}
      />

      <section id="locations-section" className="page-grid page-grid-aside">
        <div className="page-panel add-form-panel">
          <div className="section-heading">
            <div>
              <h3 className="section-title">Add a location</h3>
              <p className="section-copy">Create a clean room-to-sensor assignment before new readings start flowing in.</p>
            </div>
          </div>
          <div className="stacked-form">
            <input
              id="new-name"
              type="text"
              placeholder="Room name"
              value={locationDraft.name}
              onChange={event => setLocationDraft(draft => ({ ...draft, name: event.target.value }))}
            />
            <input
              id="new-mac"
              type="text"
              placeholder="AA:BB:CC:DD:EE:FF"
              value={locationDraft.sensorMac}
              onChange={event => setLocationDraft(draft => ({ ...draft, sensorMac: event.target.value }))}
            />
            <select
              id="new-group"
              value={locationDraft.groupId}
              onChange={event => setLocationDraft(draft => ({ ...draft, groupId: event.target.value }))}
            >
              {groups.map(group => (
                <option key={group._id} value={group._id}>{group.name}</option>
              ))}
            </select>
            <button id="add-location-btn" className="btn btn-add btn-large" onClick={handleAddLocation}>Add</button>
          </div>
          <p className="panel-note">Tip: keep the location names human-first so cards and charts stay easy to scan.</p>
        </div>

        <div className="page-panel">
          <div className="section-heading">
            <div>
              <h3 className="section-title">Location registry</h3>
              <p className="section-copy">Edit assignments, move sensors between groups, or retire a room and its history together.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table id="locations-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Sensor MAC</th>
                  <th>Group</th>
                  <th />
                </tr>
              </thead>
              <tbody id="locations-tbody">
                {locations.map(location => {
                  const isEditing = editingLocationId === location._id;
                  const draft = editLocationDrafts[location._id] || {
                    name: location.name,
                    sensorMac: location.sensorMac,
                    groupId: location.groupId,
                  };
                  return (
                    <tr key={location._id} data-id={location._id}>
                      <td data-label="Name">
                        <span className="cell-text" style={{ display: isEditing ? 'none' : '' }}>{location.name}</span>
                        <input
                          className="cell-input"
                          type="text"
                          style={{ display: isEditing ? '' : 'none' }}
                          value={draft.name}
                          onChange={event => setEditLocationDrafts(previous => ({
                            ...previous,
                            [location._id]: { ...draft, name: event.target.value },
                          }))}
                        />
                      </td>
                      <td data-label="Sensor MAC">
                        <span className="cell-text mono-text" style={{ display: isEditing ? 'none' : '' }}>{location.sensorMac}</span>
                        <input
                          className="cell-input"
                          type="text"
                          style={{ display: isEditing ? '' : 'none' }}
                          value={draft.sensorMac}
                          onChange={event => setEditLocationDrafts(previous => ({
                            ...previous,
                            [location._id]: { ...draft, sensorMac: event.target.value },
                          }))}
                        />
                      </td>
                      <td data-label="Group">
                        <span className="cell-text" style={{ display: isEditing ? 'none' : '' }}>{location.groupName}</span>
                        <select
                          className="cell-input group-input"
                          style={{ display: isEditing ? '' : 'none' }}
                          value={draft.groupId}
                          onChange={event => setEditLocationDrafts(previous => ({
                            ...previous,
                            [location._id]: { ...draft, groupId: event.target.value },
                          }))}
                        >
                          {groups.map(group => (
                            <option key={group._id} value={group._id}>{group.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="actions" data-label="Actions">
                        {isEditing ? (
                          <>
                            <button className="btn btn-save" onClick={() => handleSaveLocation(location._id)}>Save</button>
                            <button className="btn btn-cancel" onClick={() => setEditingLocationId(null)}>Cancel</button>
                          </>
                        ) : (
                          <button
                            className="btn btn-edit"
                            onClick={() => {
                              setEditingLocationId(location._id);
                              setEditLocationDrafts(previous => ({
                                ...previous,
                                [location._id]: {
                                  name: location.name,
                                  sensorMac: location.sensorMac,
                                  groupId: location.groupId,
                                },
                              }));
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <button className="btn btn-delete" onClick={() => handleDeleteLocation(location._id)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <p id="locations-error" className="error-msg">{locationsError}</p>
    </>
  );
}
