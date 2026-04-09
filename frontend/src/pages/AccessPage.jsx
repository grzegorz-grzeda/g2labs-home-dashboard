import React from 'react';

function getSelectedValues(selectElement) {
  return Array.from(selectElement.selectedOptions).map(option => option.value);
}

export default function AccessPage({
  accessData,
  editUserDrafts,
  setEditUserDrafts,
  newGroupDraft,
  setNewGroupDraft,
  handleCreateGroup,
  newUserDraft,
  setNewUserDraft,
  handleCreateUser,
  handleSaveUser,
  accessError,
}) {
  return (
    <section id="access-section">
      <h2>Access Management</h2>
      <div className="access-grid">
        <div className="access-panel">
          <h3>Groups</h3>
          <div id="groups-list" className="groups-list">
            {accessData.groups.map(group => (
              <div key={group._id} className="group-pill-card">
                <div className="group-pill-name">{group.name}</div>
                <div className="group-pill-description">{group.description || 'No description'}</div>
              </div>
            ))}
          </div>
          <div className="stacked-form">
            <input
              id="group-name"
              type="text"
              placeholder="Group name"
              value={newGroupDraft.name}
              onChange={event => setNewGroupDraft(draft => ({ ...draft, name: event.target.value }))}
            />
            <input
              id="group-description"
              type="text"
              placeholder="Description (optional)"
              value={newGroupDraft.description}
              onChange={event => setNewGroupDraft(draft => ({ ...draft, description: event.target.value }))}
            />
            <button id="add-group-btn" className="btn btn-add" onClick={handleCreateGroup}>Create Group</button>
          </div>
        </div>

        <div className="access-panel">
          <h3>Users</h3>
          <div className="table-scroll">
            <table id="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Password</th>
                  <th>Groups</th>
                  <th />
                </tr>
              </thead>
              <tbody id="users-tbody">
                {accessData.users.map(user => (
                  <tr key={user._id} data-id={user._id}>
                    {(() => {
                      const draft = editUserDrafts[user._id] || {
                        role: user.role,
                        password: '',
                        groupIds: user.groupIds,
                      };
                      return (
                        <>
                    <td data-label="Name">{user.name}</td>
                    <td data-label="Username">{user.username}</td>
                    <td data-label="Role">
                      <select
                        className="user-role-input"
                        value={draft.role}
                        onChange={event => setEditUserDrafts(previous => ({
                          ...previous,
                          [user._id]: { ...draft, role: event.target.value },
                        }))}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td data-label="Password">
                      <input
                        className="user-password-input"
                        type="password"
                        placeholder="Leave unchanged"
                        value={draft.password}
                        onChange={event => setEditUserDrafts(previous => ({
                          ...previous,
                          [user._id]: { ...draft, password: event.target.value },
                        }))}
                      />
                    </td>
                    <td data-label="Groups">
                      <select
                        className="user-groups-input"
                        multiple
                        size={Math.min(Math.max(accessData.groups.length, 2), 6)}
                        value={draft.groupIds}
                        onChange={event => setEditUserDrafts(previous => ({
                          ...previous,
                          [user._id]: {
                            ...draft,
                            groupIds: Array.from(event.target.selectedOptions).map(option => option.value),
                          },
                        }))}
                      >
                        {accessData.groups.map(group => (
                          <option key={group._id} value={group._id}>{group.name}</option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Actions" className="actions">
                      <button className="btn btn-save-user" onClick={() => handleSaveUser(user._id)}>Save</button>
                    </td>
                        </>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td data-label="Name">
                    <input
                      id="new-user-name"
                      type="text"
                      placeholder="Full name"
                      value={newUserDraft.name}
                      onChange={event => setNewUserDraft(draft => ({ ...draft, name: event.target.value }))}
                    />
                  </td>
                  <td data-label="Username">
                    <input
                      id="new-user-username"
                      type="text"
                      placeholder="username"
                      value={newUserDraft.username}
                      onChange={event => setNewUserDraft(draft => ({ ...draft, username: event.target.value }))}
                    />
                  </td>
                  <td data-label="Role">
                    <select
                      id="new-user-role"
                      value={newUserDraft.role}
                      onChange={event => setNewUserDraft(draft => ({ ...draft, role: event.target.value }))}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td data-label="Password">
                    <input
                      id="new-user-password"
                      type="password"
                      placeholder="Password"
                      value={newUserDraft.password}
                      onChange={event => setNewUserDraft(draft => ({ ...draft, password: event.target.value }))}
                    />
                  </td>
                  <td data-label="Groups">
                    <select
                      id="new-user-groups"
                      multiple
                      size={Math.min(Math.max(accessData.groups.length, 2), 6)}
                      value={newUserDraft.groupIds}
                      onChange={event => setNewUserDraft(draft => ({ ...draft, groupIds: getSelectedValues(event.target) }))}
                    >
                      {accessData.groups.map(group => (
                        <option key={group._id} value={group._id}>{group.name}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Actions">
                    <button id="add-user-btn" className="btn btn-add" onClick={handleCreateUser}>Add User</button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
      <p id="access-error" className="error-msg">{accessError}</p>
    </section>
  );
}
