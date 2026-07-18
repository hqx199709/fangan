const { createApp, ref, onMounted, watch } = Vue;

const API_BASE = 'http://localhost:3000';

createApp({
    setup() {
        const loading = ref(false);
        const assets = ref([]);
        
        const moduleCategories = [
            {
                category: '全自动样品处理系统',
                modules: ['进出样模块', '倾倒式进样模块', '离心模块', '离心机', '开盖模块', '分杯模块', '封膜模块', '去膜模块', '低温存储单元', '低温存储单元（5550）']
            },
            {
                category: '全自动生化分析仪',
                modules: ['Biossays C8', 'Biossays C10', 'LST008 α<SSS>', 'LST008 α<SS>', 'LST008 α<S>', 'AU5811', 'AU5821', 'AU5831']
            },
            {
                category: '全自动免疫分析仪',
                modules: ['MAGLUMI X8', 'MAGLUMI X10']
            },
            {
                category: '其他扩展模块',
                modules: ['E6Plus']
            }
        ];

        const filter = ref({
            length: '',
            width: '',
            modules: [],
            moduleQuantities: {},
            keyword: ''
        });

        const showUploadModal = ref(false);
        const uploading = ref(false);
        const displayMode = ref('list');
        const showMobileFilter = ref(false);
        
        const isEditMode = ref(false);
        const editAssetId = ref(null);
        const uploadForm = ref({
            name: '',
            length: '',
            width: '',
            modules: [],
            moduleQuantities: {},
            plan_image: null,
            effect_image: null
        });

        const selectedAsset = ref(null);
        const currentView = ref('plan'); // 'plan' | 'effect'

        let allAssetsCache = null;
        const fetchAssets = async () => {
            loading.value = true;
            try {
                const isStaticEnv = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:';
                
                if (isStaticEnv) {
                    if (!allAssetsCache) {
                        const res = await fetch('data.json');
                        if (!res.ok) throw new Error('网络请求失败');
                        allAssetsCache = await res.json();
                    }
                    
                    let result = allAssetsCache;
                    
                    if (filter.value.keyword) {
                        const kw = filter.value.keyword.toLowerCase();
                        result = result.filter(a => a.name.toLowerCase().includes(kw));
                    }
                    if (filter.value.length) {
                        result = result.filter(a => a.length <= parseFloat(filter.value.length));
                    }
                    if (filter.value.width) {
                        result = result.filter(a => a.width <= parseFloat(filter.value.width));
                    }
                    if (filter.value.modules.length > 0) {
                        result = result.filter(a => {
                            for (const m of filter.value.modules) {
                                const qty = filter.value.moduleQuantities[m] || 1;
                                const searchStr = `${m}(${qty})`;
                                if (!a.modules.includes(searchStr)) return false;
                            }
                            return true;
                        });
                    }
                    assets.value = result;
                } else {
                    const params = new URLSearchParams();
                    if (filter.value.length) params.append('length', filter.value.length);
                    if (filter.value.width) params.append('width', filter.value.width);
                    if (filter.value.keyword) params.append('keyword', filter.value.keyword);
                    if (filter.value.modules.length > 0) {
                        const modulesWithQty = filter.value.modules.map(m => {
                            const qty = filter.value.moduleQuantities[m] || 1;
                            return `${m}(${qty})`;
                        });
                        params.append('modules', modulesWithQty.join(','));
                    }

                    const response = await fetch(`${API_BASE}/api/assets?${params.toString()}`);
                    if (!response.ok) throw new Error('网络请求失败');
                    assets.value = await response.json();
                }
            } catch (error) {
                console.error('获取素材失败:', error);
            } finally {
                loading.value = false;
            }
        };

        const resetFilter = () => {
            filter.value = {
                length: '',
                width: '',
                modules: [],
                moduleQuantities: {},
                keyword: ''
            };
            fetchAssets();
        };

        watch(filter, () => {
            fetchAssets();
        }, { deep: true });

        const handlePaste = (field, event) => {
            const items = (event.clipboardData || event.originalEvent.clipboardData).items;
            for (let item of items) {
                if (item.type.indexOf("image") === 0) {
                    const blob = item.getAsFile();
                    uploadForm.value[field] = blob;
                    return;
                }
            }
        };

        const handleFileChange = (field, event) => {
            const file = event.target.files[0];
            if (file) {
                uploadForm.value[field] = file;
            }
        };

        const openUploadModal = () => {
            isEditMode.value = false;
            editAssetId.value = null;
            uploadForm.value = {
                name: '',
                length: '',
                width: '',
                modules: [],
                moduleQuantities: {},
                plan_image: null,
                effect_image: null
            };
            showUploadModal.value = true;
        };

        const openEditModal = () => {
            if (!selectedAsset.value) return;
            const asset = selectedAsset.value;
            isEditMode.value = true;
            editAssetId.value = asset.id;
            
            const parsedModules = parseModules(asset.modules);
            const mList = [];
            const mQ = {};
            parsedModules.forEach(mod => {
                const match = mod.match(/(.+)\((\d+)\)/);
                if (match) {
                    mList.push(match[1]);
                    mQ[match[1]] = parseInt(match[2]);
                }
            });

            uploadForm.value = {
                name: asset.name,
                length: asset.length,
                width: asset.width,
                modules: mList,
                moduleQuantities: mQ,
                plan_image: null, 
                effect_image: null 
            };
            showUploadModal.value = true;
            selectedAsset.value = null;
        };

        const submitUpload = async () => {
            if (!uploadForm.value.name || !uploadForm.value.length || !uploadForm.value.width) {
                alert('请填写完整的方案基础信息！');
                return;
            }

            if (!isEditMode.value && !uploadForm.value.plan_image) {
                alert('上传新方案必须提供平面图！');
                return;
            }

            uploading.value = true;
            try {
                const formData = new FormData();
                formData.append('name', uploadForm.value.name);
                formData.append('length', uploadForm.value.length);
                formData.append('width', uploadForm.value.width);

                const modulesWithQty = uploadForm.value.modules.map(m => {
                    const qty = uploadForm.value.moduleQuantities[m] || 1;
                    return `${m}(${qty})`;
                });
                formData.append('modules', modulesWithQty.join(','));

                if (uploadForm.value.plan_image) formData.append('planImage', uploadForm.value.plan_image);
                if (uploadForm.value.effect_image) formData.append('effectImage', uploadForm.value.effect_image);

                let url = `${API_BASE}/api/assets`;
                let method = 'POST';

                if (isEditMode.value) {
                    url = `${API_BASE}/api/assets/${editAssetId.value}`;
                    method = 'PUT';
                }

                const response = await fetch(url, {
                    method: method,
                    body: formData
                });

                if (!response.ok) throw new Error('保存失败');
                
                alert(isEditMode.value ? '方案修改成功！' : '方案上传成功！');
                showUploadModal.value = false;
                fetchAssets(); 
            } catch (error) {
                console.error('保存失败:', error);
                alert('保存失败，请稍后重试。');
            } finally {
                uploading.value = false;
            }
        };

        const deleteAssetConfirm = async () => {
            if (!selectedAsset.value) return;
            if (!confirm(`确定要删除方案 "${selectedAsset.value.name}" 吗？此操作不可恢复。`)) return;

            try {
                const response = await fetch(`${API_BASE}/api/assets/${selectedAsset.value.id}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) throw new Error('删除失败');
                
                alert('删除成功！');
                selectedAsset.value = null;
                fetchAssets();
            } catch (error) {
                console.error('删除失败:', error);
                alert('删除失败，请稍后重试。');
            }
        };

        const viewAsset = (asset) => {
            selectedAsset.value = asset;
            currentView.value = 'plan';
        };

        const parseModules = (modulesStr) => {
            if (!modulesStr) return [];
            return modulesStr.split(',').filter(m => m.trim() !== '');
        };

        const getThumbnail = (path) => {
            return getImageUrl(path);
        };

        const getImageUrl = (path) => {
            if (!path) return '';
            const isStaticEnv = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:';
            if (isStaticEnv && path.startsWith('/')) {
                return '.' + path;
            }
            return `${API_BASE}${path}`;
        };

        const downloadAsset = async () => {
            if (!selectedAsset.value) return;
            const path = currentView.value === 'plan' ? selectedAsset.value.plan_image : selectedAsset.value.effect_image;
            if (!path) return;
            
            const url = getImageUrl(path);
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = `${selectedAsset.value.name}-${currentView.value === 'plan' ? '平面图' : '效果图'}.png`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(downloadUrl);
            } catch (e) {
                console.error("下载失败:", e);
                window.open(url, '_blank');
            }
        };

        onMounted(() => {
            fetchAssets();
        });

        return {
            loading, assets, moduleCategories, filter,
            showUploadModal, uploading, uploadForm,
            selectedAsset, currentView, isEditMode, displayMode, showMobileFilter,
            fetchAssets, resetFilter, handleFileChange, handlePaste, submitUpload,
            viewAsset, parseModules, getThumbnail, getImageUrl, downloadAsset, deleteAssetConfirm,
            openUploadModal, openEditModal
        };
    }
}).mount('#app');
