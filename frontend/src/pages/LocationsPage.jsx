import React from 'react';

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
  return (
    <section id="locations-section">
      <h2>Locations</h2>
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
                    <span className="cell-text" style={{ display: isEditing ? 'none' : '' }}>{location.sensorMac}</span>
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
                      {(currentUserContext?.groups || []).map(group => (
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
          <tfoot>
            <tr>
              <td data-label="Name">
                <input
                  id="new-name"
                  type="text"
                  placeholder="Room name"
                  value={locationDraft.name}
                  onChange={event => setLocationDraft(draft => ({ ...draft, name: event.target.value }))}
                />
              </td>
              <td data-label="Sensor MAC">
                <input
                  id="new-mac"
                  type="text"
                  placeholder="AA:BB:CC:DD:EE:FF"
                  value={locationDraft.sensorMac}
                  onChange={event => setLocationDraft(draft => ({ ...draft, sensorMac: event.target.value }))}
                />
              </td>
              <td data-label="Group">
                <select
                  id="new-group"
                  value={locationDraft.groupId}
                  onChange={event => setLocationDraft(draft => ({ ...draft, groupId: event.target.value }))}
                >
                  {(currentUserContext?.groups || []).map(group => (
                    <option key={group._id} value={group._id}>{group.name}</option>
                  ))}
                </select>
              </td>
              <td data-label="Actions">
                <button id="add-location-btn" className="btn btn-add" onClick={handleAddLocation}>Add</button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p id="locations-error" className="error-msg">{locationsError}</p>
    </section>
  );
}
