// js/ui/support-activities.js
// Sous-module UI pour la gestion des activités du Support Journée

(function () {
    function createSupportActivitiesModule(deps) {
        const {
            getActivities,
            setEditingActivityIndex,
            getEditingActivityIndex,
            getActivitySearchTerm,
            setActivitySearchTerm,
            activityDisplayLabel,
            sanitizeActivityColor,
            sanitizeAttendanceType,
            attendanceBadge,
            normalizeActivity,
            slugify,
            defaultActivityColor,
            renderTable,
            saveActivities,
            showActivityToast,
        } = deps;

        function renderParams() {
            renderActivitiesGrid();
        }

        function renderActivitiesGrid() {
            const grid = document.getElementById('paramGrid');
            if (!grid) return;

            const activities = getActivities();
            const currentSearch = getActivitySearchTerm();
            const filteredActivities = currentSearch
                ? activities.filter(a => activityDisplayLabel(a).toLowerCase().includes(currentSearch))
                : activities;

            grid.replaceChildren();

            const buildAttendanceOption = (value, label, current) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                option.selected = current === value;
                return option;
            };

            filteredActivities.forEach((a, index) => {
                const realIndex = activities.indexOf(a);
                const card = document.createElement('div');
                card.className = 'param-card';

                const colorZone = document.createElement('div');
                colorZone.className = 'param-card__color-zone';

                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.className = 'param-card__color-input';
                colorInput.value = sanitizeActivityColor(a?.color, defaultActivityColor);
                colorInput.title = 'Changer la couleur';
                colorInput.addEventListener('change', () => {
                    window.SupportModule.updateActivityColor(realIndex, colorInput.value);
                });
                colorZone.appendChild(colorInput);

                const mainZone = document.createElement('div');
                mainZone.className = 'param-card__main-zone';

                if (getEditingActivityIndex() === realIndex) {
                    const editGrid = document.createElement('div');
                    editGrid.className = 'param-card__edit-grid';

                    const nameInput = document.createElement('input');
                    nameInput.id = `editActName_${realIndex}`;
                    nameInput.type = 'text';
                    nameInput.className = 'input';
                    nameInput.value = activityDisplayLabel(a);
                    nameInput.placeholder = 'Nom activité';

                    const attendanceSelect = document.createElement('select');
                    attendanceSelect.id = `editActAttendanceType_${realIndex}`;
                    attendanceSelect.className = 'select';
                    const attendanceValue = sanitizeAttendanceType(a?.attendanceType, activityDisplayLabel(a));
                    attendanceSelect.append(
                        buildAttendanceOption('present', 'Présent', attendanceValue),
                        buildAttendanceOption('absent', 'Absent', attendanceValue),
                        buildAttendanceOption('neutral', 'Neutre', attendanceValue)
                    );

                    editGrid.append(nameInput, attendanceSelect);
                    mainZone.appendChild(editGrid);
                } else {
                    const label = document.createElement('div');
                    label.className = 'param-card__label';
                    label.textContent = activityDisplayLabel(a);

                    const badgeCfg = attendanceBadge(a?.attendanceType || 'present');
                    const badge = document.createElement('span');
                    badge.className = 'param-badge';
                    badge.style.background = badgeCfg.bg;
                    badge.style.color = badgeCfg.fg;
                    badge.textContent = badgeCfg.text;

                    mainZone.append(label, badge);
                }

                const actions = document.createElement('div');
                actions.className = 'param-card__actions';

                if (getEditingActivityIndex() === realIndex) {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn btn--secondary param-action-btn';
                    cancelBtn.title = 'Annuler';
                    cancelBtn.textContent = 'Annuler';
                    cancelBtn.addEventListener('click', () => window.SupportModule.cancelEditActivity());

                    const saveBtn = document.createElement('button');
                    saveBtn.className = 'btn param-action-btn';
                    saveBtn.title = 'Valider';
                    saveBtn.textContent = 'Enregistrer';
                    saveBtn.addEventListener('click', () => window.SupportModule.saveEditedActivity(realIndex));

                    actions.append(cancelBtn, saveBtn);
                } else {
                    const editBtn = document.createElement('button');
                    editBtn.className = 'btn btn--secondary param-action-btn';
                    editBtn.title = 'Modifier cette activité';
                    editBtn.textContent = 'Modifier';
                    editBtn.addEventListener('click', () => window.SupportModule.startEditActivity(realIndex));

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'btn btn--secondary param-action-btn param-action-btn--danger';
                    deleteBtn.title = 'Supprimer cette activité';
                    deleteBtn.textContent = 'Supprimer';
                    deleteBtn.addEventListener('click', () => window.SupportModule.deleteActivity(realIndex));

                    actions.append(editBtn, deleteBtn);
                }

                card.append(colorZone, mainZone, actions);
                grid.appendChild(card);
            });

            if (!grid.firstChild) {
                const emptyCard = document.createElement('div');
                emptyCard.className = 'param-card';
                const mainZone = document.createElement('div');
                mainZone.className = 'param-card__main-zone';
                const label = document.createElement('div');
                label.className = 'param-card__label';
                label.textContent = 'Aucune activité trouvée.';
                mainZone.appendChild(label);
                emptyCard.appendChild(mainZone);
                grid.appendChild(emptyCard);
            }
        }

        function addActivity() {
            const nameInput = document.getElementById('newActName');
            const colorInput = document.getElementById('newActColor');
            const attendanceInput = document.getElementById('newActAttendanceType');
            const activities = getActivities();

            const label = nameInput?.value?.trim() || '';
            const color = sanitizeActivityColor(colorInput?.value, defaultActivityColor);
            const selectedType = sanitizeAttendanceType(attendanceInput?.value, label);

            if (!label) {
                showActivityToast("Veuillez entrer un nom d'activité.", 'warn');
                return;
            }

            const candidate = normalizeActivity({
                label,
                color,
                attendanceType: selectedType,
                code: `${slugify(label)}_${Date.now()}`
            });

            const duplicate = activities.some((a) => {
                const sameCode = String(a?.code || '').toLowerCase() === String(candidate?.code || '').toLowerCase();
                const sameLabel = activityDisplayLabel(a).toLowerCase() === activityDisplayLabel(candidate).toLowerCase();
                return sameCode || sameLabel;
            });

            if (duplicate) {
                showActivityToast("Cette activité existe déjà.", 'warn');
                return;
            }

            activities.push(candidate);
            saveActivities({ successMessage: "Activité enregistrée dans la base." });
            if (nameInput) nameInput.value = '';
        }

        function deleteActivity(index) {
            const activities = getActivities();
            if (!activities[index]) {
                console.warn(`[ACTIVITY] delete ignored: invalid index=${index}, size=${activities.length}`);
                return;
            }

            const actName = activityDisplayLabel(activities[index]);
            if (confirm(`Supprimer définitivement l'activité "${actName}" ?`)) {
                activities.splice(index, 1);

                const editingIndex = getEditingActivityIndex();
                if (editingIndex === index) setEditingActivityIndex(null);
                if (editingIndex !== null && editingIndex > index) setEditingActivityIndex(editingIndex - 1);

                saveActivities({ successMessage: "Activité supprimée." });
            }
        }

        function startEditActivity(index) {
            const activities = getActivities();
            if (!activities[index]) return;
            setEditingActivityIndex(index);
            renderParams();
        }

        function cancelEditActivity() {
            setEditingActivityIndex(null);
            renderParams();
        }

        function saveEditedActivity(index) {
            const activities = getActivities();
            if (!activities[index]) return;

            const nameInput = document.getElementById(`editActName_${index}`);
            const attendanceInput = document.getElementById(`editActAttendanceType_${index}`);
            const nextLabel = nameInput?.value?.trim() || '';
            const nextAttendance = sanitizeAttendanceType(attendanceInput?.value, nextLabel);

            if (!nextLabel) {
                showActivityToast("Le nom de l'activité ne peut pas être vide.", 'warn');
                return;
            }

            const duplicate = activities.some((a, idx) => {
                if (idx === index) return false;
                return activityDisplayLabel(a).toLowerCase() === nextLabel.toLowerCase();
            });

            if (duplicate) {
                showActivityToast("Une activité avec ce nom existe déjà.", 'warn');
                return;
            }

            activities[index] = normalizeActivity({
                ...activities[index],
                label: nextLabel,
                name: nextLabel,
                attendanceType: nextAttendance,
            }, activities[index]?.color || defaultActivityColor);

            setEditingActivityIndex(null);
            saveActivities({ successMessage: "Activité mise à jour dans la base." });
        }

        function updateActivityColor(index, newColor) {
            const activities = getActivities();
            if (!activities[index]) return;
            activities[index].color = sanitizeActivityColor(newColor, activities[index]?.color || defaultActivityColor);
            saveActivities({ successMessage: "Activité mise à jour dans la base." });
        }

        function filterActivities(search) {
            setActivitySearchTerm(String(search || '').trim().toLowerCase());
            renderActivitiesGrid();
        }

        function clearActivitiesFilter() {
            setActivitySearchTerm('');
            const input = document.getElementById('paramSearchInput');
            if (input) input.value = '';
            renderActivitiesGrid();
        }

        return {
            renderParams,
            renderActivitiesGrid,
            addActivity,
            deleteActivity,
            startEditActivity,
            cancelEditActivity,
            saveEditedActivity,
            updateActivityColor,
            filterActivities,
            clearActivitiesFilter,
            renderTable,
        };
    }

    window.createSupportActivitiesModule = createSupportActivitiesModule;
})();
